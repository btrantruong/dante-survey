Qualtrics.SurveyEngine.addOnload(function()
{
	/*Place your JavaScript here to run when the page loads*/
	//this.hideNextButton();

});

Qualtrics.SurveyEngine.addOnReady(function()
{
	/*Place your JavaScript here to run when the page is fully displayed*/
	
	// Get DOM elements with null checks
	var chatInput = document.getElementById('userPrompt');
	var submitBtn = document.getElementById('triggerButton');
	
	// Check if required elements exist
	if (!chatInput || !submitBtn) {
		console.error('Required DOM elements not found');
		return;
	}
	
	chatInput.disabled = true;
	submitBtn.disabled = true;
	
	// Event handler function for input changes
	function handleInputChange() {
		if (chatInput.value.trim() !== '') {
			submitBtn.disabled = false;
		} else {
			submitBtn.disabled = true;
		}
	}
	// when user clicks submit button, we get the summary from the LLM, then save it to an embedded data field called 'llm_summary'
	submitBtn.onclick = function(event) {
		var message = chatInput.value.trim();
		if (message) {
			// Save user message to embedded data
			Qualtrics.SurveyEngine.setEmbeddedData('initial_raw_opinion', message);
			
			// Clear the input field
			chatInput.value = '';
			
			// Disable the button while processing
			submitBtn.disabled = true;
			
			// Hide the next button and show waiting message
			this.hideNextButton();
			var apiStatus = document.getElementById('apiStatus');
			if (apiStatus) {
				apiStatus.textContent = "Recording your opinion... Please wait for a moment.";
				apiStatus.style.color = "blue";
			}
			
			// Get summary from LLM
			LLMSummary();
		}
	};

	// Function to send chat to OpenRouter API
	function getSummaryFromOpenRouter(userMessage, onSuccess, onError) {
		console.log("opinion to summarize:", userMessage);

		var system_prompt = 'Please summary a given opinion, keep as close to original as possible';

        var summary_instruction = 'Create a one-sentence summary of the following argument.\n\n' +
            'Omit the reasons provided (Remove everything after "because"). Just provide a statement.' +
            'If there are two or more issues in the argument, focus on the first issue mentioned." +
            "- Write it from the first person 'I believe ....'\n" +
            "- \n" +
            "- Keep it brief (under 15 words)\n" +
            "- Select only one statement (do not return I believe X and Y, only X)\n\n" +
            "Argument: " + userPrompt + "\nSummary:"; 

		// Get API key from Qualtrics embedded data
		var apiKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey');
		var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "mistralai/mistral-small-3.2-24b-instruct";
		
		// Debug: Check if API key is available
		console.log("API Key available:", apiKey ? "Yes" : "No");
		console.log("API Key length:", apiKey ? apiKey.length : 0);
		console.log("Model:", OR_model);

		// Fallback to hardcoded key if embedded data is not available (for testing)
		if (!apiKey) {
			apiKey = "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";
			console.log("Using fallback API key");
		}

		var url = "https://openrouter.ai/api/v1/chat/completions";
		var headers = {
			"Authorization": "Bearer " + apiKey,
			"Content-Type": "application/json"
		};
		
		// Debug: Log headers (without showing full API key)
		console.log("Headers:", {
			"Authorization": "Bearer " + (apiKey ? apiKey.substring(0, 10) + "..." : "undefined"),
			"Content-Type": headers["Content-Type"]
		});
		
		var payload = {
			"model": OR_model,
			"messages": [
				{
					"role": "system",
					"content": system_prompt
				},
				{
					"role": "user",
					"content": userMessage
				}
			],
			"stream": false
		};

		console.log("Payload:", payload);

		// Use XMLHttpRequest instead of fetch for better browser compatibility
		var xhr = new XMLHttpRequest();
		xhr.open("POST", url, true);
		xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
		xhr.setRequestHeader("Content-Type", "application/json");
		
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				console.log("Response status:", xhr.status);
				
				if (xhr.status === 200) {
					try {
						var data = JSON.parse(xhr.responseText);
						console.log("Response data:", data);
						var gptResponse = data.choices[0].message.content;
						onSuccess(gptResponse);
					} catch (error) {
						console.error("Error parsing response:", error);
						onError("Error: Invalid response format");
					}
				} else {
					console.error("Error response body:", xhr.responseText);
					onError("Error: HTTP " + xhr.status + " - " + xhr.responseText);
				}
			}
		};
		
		xhr.onerror = function() {
			console.error("Network error occurred");
			onError("Error: Network error occurred");
		};
		
		try {
			xhr.send(JSON.stringify(payload));
		} catch (error) {
			console.error("Error sending request:", error);
			onError("Error: " + error.message);
		}
	}
	
	// Function to handle LLM response: 
    
	function LLMSummary() {
		// Get the user message to summarize from embedded data
		var userMessage = Qualtrics.SurveyEngine.getEmbeddedData('initial_raw_opinion') || '';
		
		if (!userMessage) {
			console.error('No user message found in embedded data to summarize');
			submitBtn.disabled = false;
			return;
		}
		
		console.log("Getting summary for user message:", userMessage);
		
		// Update status
		var apiStatus = document.getElementById('apiStatus');
		if (apiStatus) {
			apiStatus.textContent = "Getting summary from AI...";
		}
		
		// Call the OpenRouter API to get the summary
		getSummaryFromOpenRouter(userMessage, 
			function(summary) {
				// Success callback: save the summary to embedded data
				console.log("Summary received:", summary);
				Qualtrics.SurveyEngine.setEmbeddedData('llm_summary', summary);
				console.log("Summary saved to embedded data 'llm_summary'");
				
				// Update status
				if (apiStatus) {
					apiStatus.textContent = "Summary completed successfully!";
					apiStatus.style.color = "green";
				}
				
				// Re-enable the button
				submitBtn.disabled = false;
				
				// Show the next button
				Qualtrics.SurveyEngine.addOnReady(function() {
					this.showNextButton();
				});
			},
			function(error) {
				// Error callback: log the error
				console.error("Error getting summary:", error);
				// Save error message to embedded data for debugging
				Qualtrics.SurveyEngine.setEmbeddedData('llm_summary', 'Error: ' + error);
				
				// Update status
				if (apiStatus) {
					apiStatus.textContent = "Error getting summary. Please try again.";
					apiStatus.style.color = "red";
				}
				
				// Re-enable the button
				submitBtn.disabled = false;
				
				// Show the next button even on error
				Qualtrics.SurveyEngine.addOnReady(function() {
					this.showNextButton();
				});
			}
		);
	}
	
	// Add input change event listener
	chatInput.addEventListener('input', handleInputChange);
	
});