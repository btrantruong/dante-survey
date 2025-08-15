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

	var initial_opinion = Qualtrics.SurveyEngine.getEmbeddedData('initial_opinion') || "There should be stricter gun control measures. It's crazy that in the most developed country in the world we still have school shooting.";
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
        "Keep your responses short and concise. Present well-reasoned supporting arguments; use concrete examples when appropriate. Maintain respect throughout the conversation and use simple language that an average person can understand. " +
        "In the last exchange, denoted by <user-last-message:>, acknowledge the participant's last message, their stance relative to yours, and explain that the four exchanges limit is up. Say goodbye, and end the conversation."
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

	// Add initial opinion to conversation history
	conversationHistory.push({"role": "user", "content": initial_opinion});

	// Now send to OpenRouter and show LLM1_msg when response arrives
	sendChatToOpenRouter(
		conversationHistory,
		function(response) {
			console.log("Current turn (first call of sendChatToOpenRouter):", getCurrentTurn());
			if (getCurrentTurn()=== 0) {
				console.log("Adding stance to initial LLM response");
				response = (
					"From the viewpoint of many " + group + " , I " + stance + " with you. "
					+ response
				)
			}
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
			console.error("Initial LLM error:", error);
			llmDot.style.display = "none";
			document.getElementById("LLM1_msg").innerHTML = "Sorry, I'm having trouble responding right now.";
			document.getElementById("LLM1_msg").style.display = "block";
			chatInput.disabled = false;
		}
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

	function getCurrentTurn() {
		var turnNumber = 1;
		while (document.getElementById('user' + turnNumber + '_msg') &&
			document.getElementById('user' + turnNumber + '_msg').style.display === 'block') {
			turnNumber++;
		}
		return turnNumber - 1; // Return the current turn (not the next one)
	}

	submitBtn.onclick = function() {
		var message = chatInput.value.trim();
		if (!message) return;

		var turnNumber = 1;
		while (document.getElementById('user' + turnNumber + '_msg') &&
			document.getElementById('user' + turnNumber + '_msg').style.display === 'block') {
			turnNumber++;
		}
		var currentTurn = turnNumber - 1;
		
		// Record timestamp when user clicks submit
		if (!turnTimestamps[currentTurn]) turnTimestamps[currentTurn] = {};
		turnTimestamps[currentTurn].userSubmit = Date.now();
		Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_user_submit', turnTimestamps[currentTurn].userSubmit);
		
		console.log('turnTimestamps', turnTimestamps)
		
		if (turnNumber === 4) {
			var warningMsg = "This is your last response. Please click 'Next' to continue.";
			document.getElementById('chatNotice').innerHTML = "<em>" + warningMsg + "</em>";
			document.getElementById('chatNotice').style.display = "block";
			qThis.showNextButton();
			
			// Add red message next to the Next button
			setTimeout(function() {
				var nextButton = document.querySelector('.NextButton');
				if (nextButton) {
					var warningDiv = document.createElement('div');
					warningDiv.innerHTML = '<span style="color: red; font-weight: bold; margin-right: 10px;">Clicking this Next button will end the conversation.</span>';
					warningDiv.style.display = 'inline-block';
					warningDiv.style.verticalAlign = 'middle';
					nextButton.parentNode.insertBefore(warningDiv, nextButton);
				}
			}, 100);
		}
		console.log('User turn number:', turnNumber);
		console.log('User message:', message);

		Qualtrics.SurveyEngine.setEmbeddedData('user_response_' + turnNumber, message);
		document.getElementById('user' + turnNumber + '_msg').innerHTML = message;
		document.getElementById('user' + turnNumber + '_msg').style.display = "block";

		chatInput.value = '';
		chat.scrollTop = chat.scrollHeight;
		LLMTalk(message, currentTurn);
	};

	function sendChatToOpenRouter(conversationHistory, onSuccess, onError) {
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
		var currentTurn = getCurrentTurn();
		console.log("Current turn (subsequent call of sendChatToOpenRouter):", currentTurn);
		if (!turnTimestamps[currentTurn]) turnTimestamps[currentTurn] = {};
		turnTimestamps[currentTurn].requestSent = requestSentTime;
		Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_request_sent', requestSentTime);

		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
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
						turnTimestamps[currentTurn].responseReceived = responseReceivedTime;
						Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_response_received', responseReceivedTime);
						console.log('turnTimestamps', turnTimestamps)
						Qualtrics.SurveyEngine.setEmbeddedData('all_openrouter_response_times', JSON.stringify(openRouterResponseTimes));
						onSuccess(data.choices[0].message.content);
						
					} catch (err) {
						console.error("Error parsing response:", err);
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

	function LLMTalk(userMessage, currentTurn) {
		chatInput.disabled = true;
		submitBtn.disabled = true;

		// Add user message to conversation history
		if (currentTurn === 4) {
			userMessage = "<user-last-message:> " + userMessage;
		}

		conversationHistory.push({"role": "user", "content": userMessage});

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
		
		if (!LLMposition) {
			console.log("No LLM placeholder found.");
			qThis.showNextButton();
			
			// Add red message next to the Next button
			setTimeout(function() {
				var nextButton = document.querySelector('.NextButton');
				if (nextButton) {
					var warningDiv = document.createElement('div');
					warningDiv.innerHTML = '<span style="color: red; font-weight: bold; margin-right: 10px;">Clicking this Next button will end the conversation.</span>';
					warningDiv.style.display = 'inline-block';
					warningDiv.style.verticalAlign = 'middle';
					nextButton.parentNode.insertBefore(warningDiv, nextButton);
				}
			}, 100);
			return;
		}

		var dott_id = LLMposition.split("_")[0] + '_dot';
		document.getElementById(dott_id).style.display = "block";

		// Determine turn number from LLMposition (e.g., LLM2_msg => 2)
		var turnNumber = parseInt(LLMposition.replace("LLM", "").replace("_msg", ""));

		sendChatToOpenRouter(conversationHistory,
			function(response) {
				document.getElementById(dott_id).style.display = "none";
				document.getElementById(LLMposition).innerHTML = response;
				document.getElementById(LLMposition).style.display = "block";

				// Add LLM response to conversation history
				conversationHistory.push({"role": "assistant", "content": response});

				console.log("LLM [" + turnNumber + "]: " + response);
				Qualtrics.SurveyEngine.setEmbeddedData('llm_response_' + turnNumber, response);
				
				// Check if response contains "thank you" and "goodbye"
				var responseLower = response.toLowerCase();
				if (responseLower.includes("thank") && responseLower.includes("goodbye")) {
					console.log("LLM response contains 'thank you' and 'goodbye' - showing Next button");
					qThis.showNextButton();
					
					// Add red message next to the Next button
					setTimeout(function() {
						var nextButton = document.querySelector('.NextButton');
						if (nextButton) {
							var warningDiv = document.createElement('div');
							warningDiv.innerHTML = '<span style="color: red; font-weight: bold; margin-right: 10px;">Clicking this Next button will end the conversation.</span>';
							warningDiv.style.display = 'inline-block';
							warningDiv.style.verticalAlign = 'middle';
							nextButton.parentNode.insertBefore(warningDiv, nextButton);
						}
					}, 100);
				}
				
				chatInput.disabled = false;
			}, function(error) {
				console.error("LLM [" + turnNumber + "] error:" +error);
				document.getElementById(dott_id).style.display = "none";
				document.getElementById(LLMposition).innerHTML = error;
				document.getElementById(LLMposition).style.display = "block";
				chatInput.disabled = false;
			}
		);
	}
});