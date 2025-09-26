Qualtrics.SurveyEngine.addOnReady(function() {
    jQuery("#NextButton").hide();
    
    // Track errors for summary block
    var summaryErrorLog = []; // [{timestamp, errorType, errorMessage, context}]
    
    // Key rotation management
    var currentKeyIndex = 0; // Track which key we're currently using
    var availableKeys = []; // Will store all available API keys
    var usedKeys = new Set(); // Track which keys have been used in this session
    var totalRetryCount = 0; // Track total retries across all attempts
    
    // Initialize available keys
    function initializeKeys() {
        var primaryKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or...";
        var otherKeys = [];
        for (var i = 1; i <= 2; i++) {
            var key = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey' + i);
            if (key) {
                otherKeys.push(key);
            }
        }
        availableKeys=otherKeys
        // availableKeys = [primaryKey, ...otherKeys].filter(key => key && key !== "sk-or...");
        console.log("Initialized with", availableKeys.length, "API keys");
        console.log("Available keys:", availableKeys);
    }
    
    // Get next available key
    function getNextKey() {
        if (availableKeys.length === 0) {
            initializeKeys();
        }
        
        // Find next unused key
        for (var i = 0; i < availableKeys.length; i++) {
            var keyIndex = (currentKeyIndex + i) % availableKeys.length;
            var key = availableKeys[keyIndex];
            if (!usedKeys.has(key)) {
                currentKeyIndex = keyIndex;
                usedKeys.add(key);
                console.log("Using API key at index", keyIndex);
                return key;
            }
        }
        
        // If all keys used, reset and use first key
        console.log("All keys used, resetting to first key");
        usedKeys.clear();
        currentKeyIndex = 0;
        usedKeys.add(availableKeys[0]);
        return availableKeys[0];
    }
    
    // Mark current key as failed and get next key
    function rotateToNextKey() {
        if (availableKeys.length > 1) {
            currentKeyIndex = (currentKeyIndex + 1) % availableKeys.length;
            console.log("Rotated to key index", currentKeyIndex);
        }
    }
    
    // Show exhaustion message and enable Next button
    function showExhaustionMessage() {
        document.getElementById('apiStatus').innerText = 
            "We are facing some trouble with the chatbot right now. Please click Next and retry again in a few minutes. If the problem persists, please contact us at gciampag+chat@umd.edu. Thank you for the patience!";
        document.getElementById('apiStatus').style.color = "red";
        jQuery("#NextButton").show();

        Qualtrics.SurveyEngine.setEmbeddedData('summary_passed', "false");
        console.log("Variable `summary_passed`: ", Qualtrics.SurveyEngine.getEmbeddedData('summary_passed'));
    }

    // Helper function to log summary block errorss
    function logSummaryError(errorType, errorMessage, context = {}) {
        var errorEntry = {
            timestamp: Date.now(),
            errorType: errorType,
            errorMessage: errorMessage,
            context: context,
            block: "SUMMARY" // Distinguish from treatment block
        };
        summaryErrorLog.push(errorEntry);
        
        // Save to Qualtrics embedded data with summary prefix
        Qualtrics.SurveyEngine.setEmbeddedData('summary_error_log', JSON.stringify(summaryErrorLog));
        Qualtrics.SurveyEngine.setEmbeddedData('summary_error_count', summaryErrorLog.length);
        Qualtrics.SurveyEngine.setEmbeddedData('summary_last_error', JSON.stringify(errorEntry));
        
        console.error(`[SUMMARY-${errorType}]:`, errorMessage, context);
    }

    function sendChatToOpenRouter(instructions, onSuccess, onError, retryCount = 0) {
        var apiKey = getNextKey();
        var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "openai/gpt-4.1";

        var payload = {
            "model": OR_model,
            "messages": [
                {"role": "user", "content": instructions}
            ],
            "stream": false
        };

        console.log("Sending to OpenRouter with key index", currentKeyIndex, "retry count:", retryCount, "total retries:", totalRetryCount, ":", payload);

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions", true);
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("Content-Type", "application/json");
        
        // Record request timestamp for timeout tracking
        var requestSentTime = Date.now();
        
        // Set up timeout (1.5 minutes)
        var timeoutId = setTimeout(function() {
            logSummaryError("API_TIMEOUT", "Summary generation timed out after 1.5 minutes", {
                timeoutThreshold: 90000,
                requestSentTime: requestSentTime,
                elapsedTime: Date.now() - requestSentTime,
                instructionsLength: instructions.length,
                retryCount: retryCount,
                currentKeyIndex: currentKeyIndex
            });
            xhr.abort();
            
            // Try with next key if we haven't reached max retries (2)
            if (retryCount < 2) {
                console.log("Timeout occurred, trying with next API key...");
                rotateToNextKey();
                sendChatToOpenRouter(instructions, onSuccess, onError, retryCount + 1);
            } else {
                onError("Request timed out after 2 retries");
            }
        }, 90000);

        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                clearTimeout(timeoutId);
                console.log("OpenRouter response status:", xhr.status);
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        onSuccess(data.choices[0].message.content);
                    } catch (err) {
                        logSummaryError("JSON_PARSE_ERROR", "Error parsing summary response: " + err.message, {
                            responseText: xhr.responseText,
                            status: xhr.status,
                            instructionsLength: instructions.length
                        });
                        onError("Error parsing response");
                    }
                } else {
                    logSummaryError("HTTP_ERROR", "HTTP " + xhr.status, {
                        status: xhr.status,
                        statusText: xhr.statusText,
                        responseText: xhr.responseText,
                        instructionsLength: instructions.length,
                        retryCount: retryCount,
                        currentKeyIndex: currentKeyIndex
                    });
                    
                    // Try with next key for certain HTTP errors
                    if ((xhr.status === 401 || xhr.status === 403 || xhr.status >= 500) && retryCount < 2) {
                        console.log("HTTP error occurred, trying with next API key...");
                        rotateToNextKey();
                        sendChatToOpenRouter(instructions, onSuccess, onError, retryCount + 1);
                    } else {
                        onError("Error: HTTP " + xhr.status);
                    }
                }
            }
        };

        xhr.onerror = function() {
            clearTimeout(timeoutId);
            logSummaryError("NETWORK_ERROR", "Network error during summary generation", {
                readyState: xhr.readyState,
                instructionsLength: instructions.length,
                retryCount: retryCount,
                currentKeyIndex: currentKeyIndex
            });
            
            // Try with next key for network errors
            if (retryCount < 2) {
                console.log("Network error occurred, trying with next API key...");
                rotateToNextKey();
                sendChatToOpenRouter(instructions, onSuccess, onError, retryCount + 1);
            } else {
                onError("Network error after 2 retries");
            }
        };

        xhr.send(JSON.stringify(payload));
    }

    document.getElementById('triggerButton').addEventListener('click', function() {
        var userPrompt = document.getElementById('userPrompt').value.trim();
        if (userPrompt.length < 100) {
            var remaining = 100 - userPrompt.length;
            document.getElementById('apiStatus').innerText = 
                "Please enter at least 100 characters before submitting. " +
                remaining + " more characters needed.";
            document.getElementById('apiStatus').style.color = "blue";
            return;
        }
        
        // Check if we've exceeded max retries
        if (totalRetryCount >= 2) {
            showExhaustionMessage();
            return;
        }
        
        // Rotate to next key on retry (when user clicks submit again after error)
        if (document.getElementById('apiStatus').innerText.includes("Error") || 
            document.getElementById('apiStatus').innerText.includes("Please click the submit button again")) {
            console.log("Retry detected, rotating to next API key...");
            totalRetryCount++;
            rotateToNextKey();
        }
        
        Qualtrics.SurveyEngine.setEmbeddedData('initial_opinion', userPrompt);

        document.getElementById('apiStatus').innerText = "Generating summary... Please wait.";
        document.getElementById('apiStatus').style.color = "blue";

        var topic = Qualtrics.SurveyEngine.getEmbeddedData('topic');
        var instructions = ("<argument:> " + userPrompt + ".\n"+
        "Infer the stance of the above argument (<argument:>) about the topic of " + topic +". Choose the stance from this list: very conservative, somewhat conservative, slightly conservative, moderate, slightly liberal, somewhat liberal, very liberal. "+
        "Create a one-sentence summary of the argument. The summary should start with 'I believe' and only express one concept regarding the issue at a time, ignore the rest of the argument if needed. Format the answer as follows:\n"+
        "<position:>\n"+
        "<summary:>\n");

        sendChatToOpenRouter(
            instructions,
            function(response) {
                console.log("Instructions:", instructions);
                console.log('response: ', response)
                
                try {
                    var apiResponse = response;
                    var position = apiResponse.split(" \n<summary:> ")[0].split("<position:> ")[1];
                    var summary = apiResponse.split(" \n<summary:> ")[1];
                    
                    // Validate response format
                    if (!position || !summary) {
                        logSummaryError("RESPONSE_FORMAT_ERROR", "Invalid response format from API", {
                            response: response,
                            hasPosition: !!position,
                            hasSummary: !!summary,
                            instructionsLength: instructions.length
                        });
                        throw new Error("Invalid response format");
                    }
                    
                    console.log('position: ', position);
                    console.log('summary: ', summary);
                    Qualtrics.SurveyEngine.setEmbeddedData('summary', summary);
                    Qualtrics.SurveyEngine.setEmbeddedData('inital_opinion_leaning', position);
                    document.getElementById('apiStatus').innerText = "Summary generated! You can now proceed.";
                    jQuery("#NextButton").show();
                } catch (parseError) {
                    logSummaryError("RESPONSE_PARSE_ERROR", "Error parsing summary response: " + parseError.message, {
                        response: response,
                        instructionsLength: instructions.length,
                        userPrompt: userPrompt,
                        currentKeyIndex: currentKeyIndex
                    });
                    showExhaustionMessage();
                }
            },
            function(error) {
                logSummaryError("SUMMARY_API_ERROR", error, {
                    apiKey: Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') ? "present" : "missing",
                    model: Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "default",
                    instructions: instructions,
                    userPrompt: userPrompt,
                    topic: topic,
                    currentKeyIndex: currentKeyIndex
                });
                console.error(error);
                showExhaustionMessage();
            }
        );
    });
});