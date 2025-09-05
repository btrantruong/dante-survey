Qualtrics.SurveyEngine.addOnReady(function() {
    jQuery("#NextButton").hide();
    
    // Track errors for summary block
    var summaryErrorLog = []; // [{timestamp, errorType, errorMessage, context}]
    
    // Helper function to log summary block errors
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

    function sendChatToOpenRouter(instructions, onSuccess, onError) {
        var apiKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or-...";
        var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "openai/gpt-4.1";

        var payload = {
            "model": OR_model,
            "messages": [
                {"role": "user", "content": instructions}
            ],
            "stream": false
        };

        console.log("Sending to OpenRouter:", payload);

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions", true);
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                console.log("OpenRouter response status:", xhr.status);
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        onSuccess(data.choices[0].message.content);
                    } catch (err) {
                        onError("Error parsing response");
                    }
                } else {
                    onError("Error: HTTP " + xhr.status);
                }
            }
        };

        xhr.onerror = function() {
            onError("Network error");
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
        Qualtrics.SurveyEngine.setEmbeddedData('initial_opinion', userPrompt);

        document.getElementById('apiStatus').innerText = "Generating summary... Please wait.";
        document.getElementById('apiStatus').style.color = "blue";

        var topic = Qualtrics.SurveyEngine.getEmbeddedData('topic');
        var instructions = ("<argument:>" + userPrompt + ".\n"+
        "Infer the stance of the above argument (<argument:>) about the topic of " + topic +". Choose the stance from this list: very conservative, somewhat conservative, slightly conservative, moderate, slightly liberal, somewhat liberal, very liberal. "+
        "Create a one-sentence summary of the argument. The summary should start with 'I believe' and only express one concept regarding the issue at a time, ignore the rest of the argument if needed. Format the answer as follows:\n"+
        "<position:>\n"+
        "<summary:>\n");

        sendChatToOpenRouter(
            instructions,
            function(response) {
                console.log("Instructions:", instructions);
                console.log('response: ', response)
                var apiResponse = response;
                var position = apiResponse.split(" \n<summary:> ")[0].split("<position:> ")[1]
                var summary = apiResponse.split(" \n<summary:> ")[1]
                console.log('position: ', position)
                console.log('summary: ', summary)
                Qualtrics.SurveyEngine.setEmbeddedData('summary', summary);
                Qualtrics.SurveyEngine.setEmbeddedData('inital_opinion_leaning', position);
                document.getElementById('apiStatus').innerText = "Summary generated! You can now proceed.";
                jQuery("#NextButton").show();
            },
            function(error) {
                console.error(error);
                document.getElementById('apiStatus').innerText = "Error generating summary. Please try again.";
                jQuery("#NextButton").show();
            }
        );
    });
});