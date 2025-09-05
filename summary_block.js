Qualtrics.SurveyEngine.addOnReady(function() {
    jQuery("#NextButton").hide();

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

        var instructions = "Create a one-sentence summary of the following argument. The summary should start with 'I believe' and only retain one clear position about one main issue from the original argument.\n" +
            "Argument: " + userPrompt + "\nSummary:";
        
        sendChatToOpenRouter(
            instructions,
            function(response) {
                console.log("Instructions:", instructions);
                var apiResponse = response;
                Qualtrics.SurveyEngine.setEmbeddedData('summary', apiResponse);
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