Qualtrics.SurveyEngine.addOnReady(function() {
    jQuery("#NextButton").hide();

    var apiKey = 'fw_3Za7mBQcUj1jyVfrxDXKgbRQ' //Qualtrics.SurveyEngine.getEmbeddedData('fireworksapiKey');
    var gpt4ApiUrl = 'https://api.openai.com/v1/chat/completions';
    var fireworksApiUrl = 'https://api.fireworks.ai/inference/v1/chat/completions';

    document.getElementById('triggerButton').addEventListener('click', function() {
        var userPrompt = document.getElementById('userPrompt').value.trim();
        var apiType = Qualtrics.SurveyEngine.getEmbeddedData('open');

        // ✅ 글자수 체크 (공백 제거 후 100자 미만 포함)
        if (userPrompt.length < 100) {
				var remaining = 100 - userPrompt.length;
				apiStatus.innerText = 
					"Please enter at least 100 characters before submitting. " +
					remaining + " more characters needed.";
				apiStatus.style.color = "blue";
				return;
			}
		Qualtrics.SurveyEngine.setEmbeddedData('initial_opinion', userPrompt);

        document.getElementById('apiStatus').innerText = "Generating summary... Please wait.";
        document.getElementById('apiStatus').style.color = "blue";

        var instructions = "Create a one-sentence summary of the following argument.\n\n" +
            "- Omit the reasons provided. Just provide a statement (abortion should be legal because it is a right => abortion should be legal)\n" +
            "- Avoid double-barreled questions (ask about only one issue position and one concept at a time)\n" +
            "- If the person mentions two or more issues, focus on the first issue mentioned.\n" +
            "- Stick to what the person says\n" +
            "- Write it from the first person 'I believe ....'\n" +
            "- Remove everything after because\n" +
            "- Keep it brief (under 15 words)\n" +
            "- Select only one statement (do not return I believe X and Y, only X)\n\n" +
            "Argument: " + userPrompt + "\nSummary:";

        var data = {
            messages: [{ role: "user", content: instructions }]
        };

        var apiUrl = '';
        if (apiType === 'no') {
            apiUrl = gpt4ApiUrl;
            data.model = "gpt-4o-mini";
        } else {
            apiUrl = fireworksApiUrl;
            data = {
                model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
                messages: [{ role: "user", content: instructions }]
            };
        }

        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            var apiResponse = data.choices ? data.choices[0].message.content : data.messages[0].content;
            Qualtrics.SurveyEngine.setEmbeddedData('summary', apiResponse);
            document.getElementById('apiStatus').innerText = "Summary generated! You can now proceed.";
            jQuery("#NextButton").show();
        })
        .catch(error => {
            console.error(error);
            document.getElementById('apiStatus').innerText = "Error generating summary. Please try again.";
            jQuery("#NextButton").show();
        });
    });
});