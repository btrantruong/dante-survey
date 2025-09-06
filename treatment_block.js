Qualtrics.SurveyEngine.addOnload(function() {
	this.hideNextButton();
});

Qualtrics.SurveyEngine.addOnReady(function() {
	var qThis = this;  
	var llmDot = document.getElementById('LLM1_dot');
	var chatInput = document.getElementById('chatInput');
	var submitBtn = document.getElementById('submit-btn');
	var chat = document.getElementById('chatBox');

	if (!llmDot || !chatInput || !submitBtn || !chat) {
		console.error('Required DOM elements not found');
		return;
	}
	chatInput.addEventListener('paste', function(e) {
		e.preventDefault();
	});

	llmDot.style.display = "block";
	chatInput.disabled = true;
	submitBtn.disabled = true;

	var initial_opinion = Qualtrics.SurveyEngine.getEmbeddedData('initial_opinion') || "there should be more promotion opportunities for minorities and women in the workplace. Maternal leave should be longer and mandatory for all companies.";
	var pid = Qualtrics.SurveyEngine.getEmbeddedData('pid') || 'Democrat';
	var treatment = Qualtrics.SurveyEngine.getEmbeddedData('treatment') || 'outgroup_disagree';
	var group = Qualtrics.SurveyEngine.getEmbeddedData('group') || 'Republican';
	var topic = Qualtrics.SurveyEngine.getEmbeddedData('topic') || 'gun policy';

	var stance = treatment.split("_")[1] == "agree" ? "agree" : "disagree";

	var disagree_blurb = (
        "People often assume that in-group members share similar views, while out-group members hold more extreme and opposing positions." +
        "In reality, people tend to overestimate how much they agree with in-partisans and underestimate the extent of agreement with out-partisans. For instance, some Democrats support stricter immigration policies, while some Republicans acknowledge human-driven climate change and advocate for responsible measures." +
        "Change this misperception by engaging with the partner, even if you don't agree with their viewpoint."
    );
    
    var agreement_blurb = "Comment on the participant's stance, share your relevant point of view, and encourage them to share their thoughts.";

    var optional_intro = treatment.split("_")[1] == "disagree" ? disagree_blurb : agreement_blurb;
    
	var system_prompt = (
        "You are a discussion partner who holds the values and viewpoints typically associated with " + group + ". " +
        "You will be having a conversation with a person who is " + pid + ". " +
        optional_intro + " " +
        "You represent the stance that " + stance + "s with the participant's opinion on " + topic + ". " +
		"The first (and only the first) response should start with: 'From the viewpoint of many " + group + "s , I " + stance + " with you.'\n" +
        "Keep your responses short and concise. Present well-reasoned supporting arguments; use concrete examples when appropriate. Maintain respect throughout the conversation and use simple language that an average person can understand. " +
        "Keep the discussion ongoing; do not say goodbye unless explicitly instructed. Only say goodbye and acknowledge the user’s stance if the message is marked with <user-last-message:>."
    );
	// Keep all exp conditions in a dictionary for easy access
	var exp_conditions = 
	{
		'pid': pid,
		'treatment': treatment,
		'group': group,
		'topic': topic,
		'initial_opinion': initial_opinion,
		'system_prompt': system_prompt,
	}

	console.log('Experiment conditions:', exp_conditions);

	// Initialize conversation history with system prompt
	var conversationHistory = [
		{"role": "system", "content": system_prompt}
	];

	// console.log('System prompt:', system_prompt);

	// Track response times
	var openRouterResponseTimes = []; // [{responseTime, responseText}]
	// Track timestamps for each turn
	var turnTimestamps = {}; // {turnNumber: {requestSent, responseReceived, userStartTyping, userSubmit}}
	// Track errors
	var errorLog = []; // [{timestamp, turn, errorType, errorMessage, context}]
	// Track current turn (starts at 1 for initial LLM response, then 2, 3, 4 for user submissions)
	var currentTurn = 1;
	// Track if red message has been shown to avoid duplicates
	var redMessageShown = false;

	var timeout_threshold = 120000; // 2 minutes
	
	// Helper function to log errors
	function logError(errorType, errorMessage, turn, context = {}) {
		var errorEntry = {
			timestamp: Date.now(),
			turn: turn,
			errorType: errorType,
			errorMessage: errorMessage,
			context: context
		};
		errorLog.push(errorEntry);
		
		// Save to Qualtrics embedded data
		Qualtrics.SurveyEngine.setEmbeddedData('error_log', JSON.stringify(errorLog));
		Qualtrics.SurveyEngine.setEmbeddedData('error_count', errorLog.length);
		Qualtrics.SurveyEngine.setEmbeddedData('last_error', JSON.stringify(errorEntry));
		
		console.error(`[${errorType}] Turn ${turn}:`, errorMessage, context);
	}
	
	// Add initial opinion to conversation history
	conversationHistory.push({"role": "user", "content": initial_opinion});

	// Now send to OpenRouter and show LLM1_msg when response arrives
	sendChatToOpenRouter(
		conversationHistory,
		function(response) {
			console.log("Current turn (first call of sendChatToOpenRouter):", 1);
			console.log("Initial LLM response:", response);
			llmDot.style.display = "none";
			document.getElementById("LLM1_msg").innerHTML = response;
			document.getElementById("LLM1_msg").style.display = "block";
			Qualtrics.SurveyEngine.setEmbeddedData('llm_response_1', response);
			// Add LLM response to conversation history
			conversationHistory.push({"role": "assistant", "content": response});
			// Record timestamp for response received (turn 1)
			if (!turnTimestamps[1]) turnTimestamps[1] = {};
			turnTimestamps[1].responseReceived = Date.now();
			Qualtrics.SurveyEngine.setEmbeddedData('turn_1_response_received', turnTimestamps[1].responseReceived);
			chatInput.disabled = false;
			submitBtn.disabled = true;
			chatInput.addEventListener('input', handleInputChange);
		},
		function(error) {
			logError("INITIAL_API_ERROR", error, 1, {
				apiKey: Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') ? "present" : "missing",
				model: Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "default",
				conversationLength: conversationHistory.length
			});
			llmDot.style.display = "none";
			document.getElementById("LLM1_msg").innerHTML = "Sorry, I'm having trouble responding right now. Please try again or click Next to continue.";
			document.getElementById("LLM1_msg").style.display = "block";
			chatInput.disabled = false;
			submitBtn.disabled = true;
			chatInput.addEventListener('input', handleInputChange);
			qThis.showNextButton();
		},
		true  // isInitialCall = true
	);

	function handleInputChange() {
		submitBtn.disabled = (chatInput.value.trim() === '');
		// Record timestamp when user starts typing (for current turn)
		var currentTurn = getCurrentTurn();
		if (!turnTimestamps[currentTurn]) turnTimestamps[currentTurn] = {};
		if (!turnTimestamps[currentTurn].userStartTyping) {
			turnTimestamps[currentTurn].userStartTyping = Date.now();
			Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_user_start_typing', turnTimestamps[currentTurn].userStartTyping);
		}
	}

	// Function to get the current turn (now just returns the global variable)
	function getCurrentTurn() {
		return currentTurn;
	}

	submitBtn.onclick = function() {
		var message = chatInput.value.trim();
		if (!message) return;

		// Increment turn for this user submission
		currentTurn++;
		
		// Record timestamp when user clicks submit
		if (!turnTimestamps[currentTurn]) turnTimestamps[currentTurn] = {};
		turnTimestamps[currentTurn].userSubmit = Date.now();
		Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_user_submit', turnTimestamps[currentTurn].userSubmit);
		
		console.log('turnTimestamps', turnTimestamps)
		
	
		console.log('User message [' + currentTurn + '] :', message);
		console.log('Displayinh user message in '+'user' + currentTurn + '_msg')
		Qualtrics.SurveyEngine.setEmbeddedData('user_response_' + currentTurn, message);
		document.getElementById('user' + currentTurn + '_msg').innerHTML = message;
		document.getElementById('user' + currentTurn + '_msg').style.display = "block";

		chatInput.value = '';
		chat.scrollTop = chat.scrollHeight;
		LLMTalk(message, currentTurn);
	};

	function sendChatToOpenRouter(conversationHistory, onSuccess, onError, isInitialCall = false) {
		var apiKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or-...";
		var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "openai/gpt-4.1";

		var payload = {
			"model": OR_model,
			"messages": conversationHistory,
			"stream": false
		};

		console.log("Sending to OpenRouter:", payload);

		var xhr = new XMLHttpRequest();
		xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions", true);
		xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
		xhr.setRequestHeader("Content-Type", "application/json");

		// Record timestamp when request is sent
		var requestSentTime = Date.now();
		var turnForThisCall = isInitialCall ? 1 : getCurrentTurn();
		
		if (!isInitialCall) {
			console.log("Current turn (sendChatToOpenRouter):", turnForThisCall);
		}

		if (!turnTimestamps[turnForThisCall]) turnTimestamps[turnForThisCall] = {};
		turnTimestamps[turnForThisCall].requestSent = requestSentTime;
		Qualtrics.SurveyEngine.setEmbeddedData('turn_' + turnForThisCall + '_request_sent', requestSentTime);

		// Error handling timeout: if the response takes longer than 2 minutes, show the next button
		var timeoutId = setTimeout(function() {
			logError("API_TIMEOUT", "Request timed out after 2 minutes", turnForThisCall, {
				timeoutThreshold: timeout_threshold,
				requestSentTime: requestSentTime,
				elapsedTime: Date.now() - requestSentTime,
				conversationLength: conversationHistory.length
			});
			console.log("2-minute timeout reached - showing next button");
			xhr.abort(); // Cancel the request
			
			// Show timeout message as regular LLM message
			var timeoutMessage = "Sorry, the response is taking longer than expected. Please click the Next button below to move on to the next section.";
			
			// Find the current LLM position to show the timeout message
			var LLMposition = "";
			var interactions = chat.querySelectorAll("div");
			for (var i = 0; i < interactions.length; i++) {
				var node = interactions[i];
				if (!node.id || node.id.endsWith("dot")) continue;
				if (node.innerHTML.trim() === 'LLMPlaceholder') {
					LLMposition = node.id;
					break;
				}
			}
			console.log("LLMposition", LLMposition);
			if (LLMposition) {
				// Hide the loading dot
				var dott_id = LLMposition.split("_")[0] + '_dot';
				var dotElement = document.getElementById(dott_id);
				if (dotElement) {
					dotElement.style.display = "none";
				}
				
				// Show timeout message as regular LLM message
				var llmElement = document.getElementById(LLMposition);
				if (llmElement) {
					llmElement.innerHTML = timeoutMessage;
					llmElement.style.display = "block";
				}
			}
			
			// Enable chat input and show next button
			chatInput.disabled = false;
			submitBtn.disabled = true;
			qThis.showNextButton();
			
			// Add red message next to the Next button
			setTimeout(function() {
				var nextButton = document.querySelector('.NextButton');
				if (nextButton) {
					var warningDiv = document.createElement('div');
					warningDiv.innerHTML = '<span style="color: red; margin-right: 10px;">Click to move to the next section where you have the option to retry the conversation.</span>';
					warningDiv.style.display = 'inline-block';
					warningDiv.style.verticalAlign = 'middle';
					nextButton.parentNode.insertBefore(warningDiv, nextButton);
				}
			}, 100);
			
		}, timeout_threshold); 

		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				// Clear the timeout since we got a response
				clearTimeout(timeoutId);
				
				console.log("OpenRouter response status:", xhr.status);
				if (xhr.status === 200) {
					// console.log("OpenRouter response:", xhr.responseText);
					try {
						var data = JSON.parse(xhr.responseText);
						console.log("Parsed data:", data);
						openRouterResponseTimes.push({
							responseTime: Date.now() - requestSentTime,
							responseText: xhr.responseText
						});
						// Record timestamp when response is received
						var responseReceivedTime = Date.now();
						turnTimestamps[turnForThisCall].responseReceived = responseReceivedTime;
						Qualtrics.SurveyEngine.setEmbeddedData('turn_' + turnForThisCall + '_response_received', responseReceivedTime);
						console.log('turnTimestamps', turnTimestamps)
						Qualtrics.SurveyEngine.setEmbeddedData('all_openrouter_response_times', JSON.stringify(openRouterResponseTimes));
						onSuccess(data.choices[0].message.content);
						
					} catch (err) {
						logError("JSON_PARSE_ERROR", "Error parsing response: " + err.message, turnForThisCall, {
							responseText: xhr.responseText.substring(0, 200) + (xhr.responseText.length > 200 ? "..." : ""),
							status: xhr.status,
							conversationLength: conversationHistory.length
						});
						onError("Error parsing response");
					}
				} else {
					logError("HTTP_ERROR", "HTTP " + xhr.status, turnForThisCall, {
						status: xhr.status,
						statusText: xhr.statusText,
						responseText: xhr.responseText.substring(0, 200) + (xhr.responseText.length > 200 ? "..." : ""),
						conversationLength: conversationHistory.length
					});
					onError("Error: HTTP " + xhr.status);
				}
			}
		};

		xhr.onerror = function() {
			// Clear the timeout since we got an error
			clearTimeout(timeoutId);
			logError("NETWORK_ERROR", "Network error occurred", turnForThisCall, {
				readyState: xhr.readyState,
				conversationLength: conversationHistory.length
			});
			onError("Network error");
		};

		xhr.send(JSON.stringify(payload));
	}

	function LLMTalk(userMessage, currentTurn) {
		chatInput.disabled = true;
		submitBtn.disabled = true;

		// Add user message to conversation history
		if (currentTurn === 4) {
			userMessage = "<user-last-message:> " + userMessage;
		}

		conversationHistory.push({"role": "user", "content": userMessage});

		
		var LLMposition = "";
		var interactions = chat.querySelectorAll("div");

		for (var i = 0; i < interactions.length; i++) {
			var node = interactions[i];
			if (!node.id || node.id.endsWith("dot")) continue;

			if (node.innerHTML.trim() === 'LLMPlaceholder') {
				LLMposition = node.id;
				break;
			}
		}

		console.log("Next LLM placeholder:", LLMposition);

		var dott_id = LLMposition.split("_")[0] + '_dot';
		document.getElementById(dott_id).style.display = "block";

		// Determine turn number from LLMposition (e.g., LLM2_msg => 2)
		var turnNumber = parseInt(LLMposition.replace("LLM", "").replace("_msg", ""));

		sendChatToOpenRouter(conversationHistory,
			function(response) {
				document.getElementById(dott_id).style.display = "none";
				
				// If currentTurn == 3, append the blurb in italic
				if (currentTurn === 3) {
					response = response + "<br><br><em>Note that our conversation will end after your next reply</em>";
				}
				
				document.getElementById(LLMposition).innerHTML = response;
				document.getElementById(LLMposition).style.display = "block";

				// Add LLM response to conversation history
				conversationHistory.push({"role": "assistant", "content": response});

				console.log("LLM [" + turnNumber + "]: " + response);
				Qualtrics.SurveyEngine.setEmbeddedData('llm_response_' + turnNumber, response);
				
				// Show warning message after LLM response for turn 4
				if (currentTurn === 4) {
					var warningMsg = "That was the last response. Please click 'Next' to continue.";
					document.getElementById('chatNotice').innerHTML = "<em>" + warningMsg + "</em>";
					document.getElementById('chatNotice').style.display = "block";
				}
				
				if (currentTurn >= 1) {
					qThis.showNextButton();
					
					// Add red message next to the Next button (only once)
					if (!redMessageShown) {
						redMessageShown = true;
						setTimeout(function() {
							var nextButton = document.querySelector('.NextButton');
							if (nextButton) {
								var warningDiv = document.createElement('div');
								warningDiv.innerHTML = '<span style="color: red; margin-right: 10px;">Click to end the conversation. <em>This action cannot be undone.</em></span>';
								warningDiv.style.display = 'inline-block';
								warningDiv.style.verticalAlign = 'middle';
								nextButton.parentNode.insertBefore(warningDiv, nextButton);
							}
						}, 100);
					}
				}
				
				chatInput.disabled = false;
			},
			function(error) {
				logError("LLM_API_ERROR", error, currentTurn, {
					llmPosition: LLMposition,
					conversationLength: conversationHistory.length,
					userMessage: userMessage.substring(0, 100) + (userMessage.length > 100 ? "..." : ""),
					apiKey: Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') ? "present" : "missing",
					model: Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "default"
				});
				document.getElementById(dott_id).style.display = "none";
				document.getElementById(LLMposition).innerHTML = "Sorry, I'm having trouble responding right now. Please try again or click Next to continue.";
				document.getElementById(LLMposition).style.display = "block";
				chatInput.disabled = false;
			}
		);

		// Check if we've reached the conversation limit (10 messages total + 2 items: system prompt and initial user message)
		if (currentTurn === 4) {
			console.log("Conversation limit reached (8 messages).");
			// Store conversation history for analysis
			var all_interactions = [];
			for (var i = 1; i < conversationHistory.length; i++) { // Skip system prompt
				var msg = conversationHistory[i];
				if (msg.role === "user") {
					all_interactions.push("User:" + msg.content);
				} else if (msg.role === "assistant") {
					all_interactions.push("LLM:" + msg.content);
				}
			}
			Qualtrics.SurveyEngine.setEmbeddedData('all_interactions', all_interactions.join("\n"));

			return;
		}

	}
});