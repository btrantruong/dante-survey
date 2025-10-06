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
    
    var agreement_blurb = "Respond to the participant's stance by affirming it and sharing your relevant point of view.";

    var optional_intro = treatment.split("_")[1] == "disagree" ? disagree_blurb : agreement_blurb;
    
	var system_prompt = (
        "You are a discussion partner who holds the values and viewpoints typically associated with " + group + ". " +
        "You will be having a conversation with a person who is " + pid + ". " +
        optional_intro + " " +
        "You represent the stance that " + stance + "s with the participant's opinion on " + topic + ". " +
        "Keep your responses short and concise. Present well-reasoned supporting arguments; use concrete examples when appropriate. Maintain respect throughout the conversation and use simple language that an average person can understand. " +
        "Have a natural discussion; do not say goodbye unless explicitly instructed. Only say goodbye and acknowledge the user's stance if the message is marked with <user-last-message:>."
    );

	var initial_system_prompt = (system_prompt + "The first (and only the first) response should start with: 'From the viewpoint of many " + group + "s , I " + stance + " with you.'")

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

	// Initialize conversation history with initial system prompt (for first turn only)
	var conversationHistory = [
		{"role": "system", "content": initial_system_prompt}
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
	
	// Key rotation management
	var currentKeyIndex = 0; // Track which key we're currently using
	var availableKeys = []; // Will store all available API keys
	var usedKeys = new Set(); // Track which keys have been used in this session
	var totalRetryCount = 0; // Track total retries across all attempts

	var timeout_threshold = 120000; // 2 minutes
	
	// Log errors with context and save to Qualtrics
	function logError(errorType, errorMessage, turn, context) {
		context = context || {};
		var errorEntry = {
			timestamp: Date.now(),
			turn: turn,
			errorType: errorType,
			errorMessage: errorMessage,
			context: context
		};
		errorLog.push(errorEntry);
		
		// Save to Qualtrics embedded data for analysis
		Qualtrics.SurveyEngine.setEmbeddedData('error_log', JSON.stringify(errorLog));
		Qualtrics.SurveyEngine.setEmbeddedData('error_count', errorLog.length);
		Qualtrics.SurveyEngine.setEmbeddedData('last_error', JSON.stringify(errorEntry));
		
		console.error("[" + errorType + "] Turn " + turn + ":", errorMessage, context);
	}
	
	// Initialize API keys from Qualtrics embedded data
	function initializeKeys() {
		var primaryKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or...";
		var otherKeys = [];
		for (var i = 1; i <= 2; i++) {
			var key = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey' + i);
			if (key) {
				otherKeys.push(key);
			}
		}
		availableKeys = [primaryKey].concat(otherKeys).filter(function(key) { 
			return key && key !== "sk-or..."; 
		});
		console.log("OpenAI API is initialized with " + availableKeys.length + " API keys.");
	}
	
	// Get next available API key for rotation
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
				console.log("Using API key at index " + keyIndex);
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
	
	// Rotate to next API key when current key fails
	function rotateToNextKey() {
		if (availableKeys.length > 1) {
			currentKeyIndex = (currentKeyIndex + 1) % availableKeys.length;
			console.log("Rotated to key index " + currentKeyIndex);
		}
	}
	
	// Show exhaustion message when API fails completely
	function showExhaustionMessage() {
		var timeoutMessage = "We are facing some trouble with the chatbot right now. Please retry in a few moments by typing your message and clicking the Send button. If the problem persists, please contact us at gciampag+chat@umd.edu. Thank you for the patience!";
		
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
		
		if (LLMposition) {
            // Hide the loading dot
			var dott_id = LLMposition.split("_")[0] + '_dot';
			var dotElement = document.getElementById(dott_id);
			if (dotElement) {
				dotElement.style.display = "none";
			}
			
            // Show exhaustion message as regular LLM message
			var llmElement = document.getElementById(LLMposition);
			if (llmElement) {
				llmElement.innerHTML = timeoutMessage;
				llmElement.style.color = "red";
				llmElement.style.display = "block";
			}
		}
		
		// Enable chat input and show next button
		chatInput.disabled = false;
		submitBtn.disabled = true;
		qThis.showNextButton();

		Qualtrics.SurveyEngine.setEmbeddedData('treatment_passed', "false");
        console.log("Variable `treatment_passed`: ", Qualtrics.SurveyEngine.getEmbeddedData('treatment_passed'));
	}

	/**
	 * Safe DOM rendering with retry mechanism
	 * @param {Function} getNode - Function that returns the DOM element
	 * @param {Function} renderFn - Function to manipulate the element
	 * @param {Function} [fallbackFn] - Optional fallback if rendering fails
	 * @param {Number} [maxTries=10] - Max retry attempts
	 * @param {Number} [delayMs=100] - Delay between retries
	 * 
	 * fallback: defines action to take if rendering fails. if not specified, the function logs the errors if rendering fails. 
	 */
	function renderWithRetry(getNode, renderFn, fallbackFn, maxTries, delayMs) {
		maxTries = maxTries || 10;
		delayMs = delayMs || 100;
		
	  var tries = 0;
	  
	  // Helper to extract element ID for error logging
	  function getElementId() {
	    if (typeof getNode === 'string') return getNode;
	    if (typeof getNode === 'function') {
	      try {
	        var node = getNode();
	        return node ? (node.id || 'id-unknown') : 'not-found';
	      } catch (e) {
	        return 'error-getting-id';
	      }
	    }
	    return 'unknown';
	  }
	  
	  (function tick() {
		console.log("⏳ renderWithRetry: Attempt " + (tries + 1) + "/" + maxTries + " - checking for element...");
	    var node = getNode();
	    if (node) {
		  console.log("✅ renderWithRetry SUCCESS: Found element after " + tries + " tries (" + (tries * delayMs) + "ms)");
	      try { 
	        renderFn(node); 
	        console.log("✅ renderWithRetry: Render function completed successfully");
		  } 
	      catch (e) { 
	        console.error("Render function failed:", e); 
	        logError("DOM_RENDER_ERROR", "Error rendering: " + e.message, getCurrentTurn(), {
	          elementId: getElementId(),
	          context: "renderWithRetry error in renderFn"
	        });
	        if (fallbackFn) fallbackFn();
		  }
	      return;
	    }
	    if (++tries >= maxTries) {
	      console.error("DOM element not found after retries. Element getter: " + getNode.toString());
	      // Log this error for debugging
	      logError("DOM_ELEMENT_NOT_FOUND", "Element not found after " + maxTries + " retries", getCurrentTurn(), {
	        elementId: getElementId(),
	        context: "renderWithRetry element not found"
	      });
	      if (fallbackFn) fallbackFn();
	      return;
	    }
	    setTimeout(tick, delayMs);
	  })();
	}
	// =====================================================================

	// Add initial opinion to conversation history
	conversationHistory.push({"role": "user", "content": initial_opinion});

	// Now send to OpenRouter and show LLM1_msg when response arrives
	sendChatToOpenRouter(
		conversationHistory,
		function(response) {
			console.log("Current turn (first call of sendChatToOpenRouter):", 1);
			console.log("Initial LLM response:", response);

			// Hide initial dot safely
			renderWithRetry(
			  () => document.getElementById("LLM1_dot"),
			  (el) => { el.style.display = "none"; }
			);

			// Render initial LLM message safely
			renderWithRetry(
			  () => document.getElementById("LLM1_msg"),
			  (el) => {
			    el.innerHTML = response;
			    el.style.display = "block";
			  }
			);

			Qualtrics.SurveyEngine.setEmbeddedData('llm_response_1', response);
			// Add LLM response to conversation history
			conversationHistory.push({"role": "assistant", "content": response});
			// Record timestamp for response received (turn 1)
			if (!turnTimestamps[1]) turnTimestamps[1] = {};
			turnTimestamps[1].responseReceived = Date.now();
			Qualtrics.SurveyEngine.setEmbeddedData('turn_1_response_received', turnTimestamps[1].responseReceived);
			var chatInput = document.getElementById('chatInput');
			var submitBtn = document.getElementById('submit-btn');
			chatInput.disabled = false;
			submitBtn.disabled = true;
			chatInput.addEventListener('input', handleInputChange);
		},
		function(error) {
			logError("INITIAL_API_ERROR", error, 1, {
				apiKey: Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') ? "present" : "missing",
				model: Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "default",
				conversationLength: conversationHistory.length,
				currentKeyIndex: currentKeyIndex
			});
			showExhaustionMessage();
			
		},
		true  // isInitialCall = true
	);

	// Handle input changes and enable/disable submit button
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

	// Get current conversation turn number
	function getCurrentTurn() {
		return currentTurn;
	}

	submitBtn.onclick = function() {
		var message = chatInput.value.trim();
		if (!message) return;
		
		// Check if we've exceeded max retries
		if (totalRetryCount >= 2) {
			showExhaustionMessage();
			return;
		}

		// Increment turn for this user submission
		currentTurn++;
		
		// Record timestamp when user clicks submit
		if (!turnTimestamps[currentTurn]) turnTimestamps[currentTurn] = {};
		turnTimestamps[currentTurn].userSubmit = Date.now();
		Qualtrics.SurveyEngine.setEmbeddedData('turn_' + currentTurn + '_user_submit', turnTimestamps[currentTurn].userSubmit);
		
		console.log('turnTimestamps', turnTimestamps)
		
		console.log('User message [' + currentTurn + '] :', message);
		console.log('Displaying user message in '+'user' + currentTurn + '_msg')
		Qualtrics.SurveyEngine.setEmbeddedData('user_response_' + currentTurn, message);
	
		var userElement = document.getElementById('user' + currentTurn + '_msg');
		if (userElement) {
			userElement.innerHTML = message;
			userElement.style.display = "block";
		} else {
			logError("DOM_ELEMENT_NOT_FOUND", "Could not find user" + currentTurn + "_msg element", currentTurn, {
				elementId: 'user' + currentTurn + '_msg',
				context: "user message display"
			});
		}

		chatInput.value = '';
		chat.scrollTop = chat.scrollHeight;
		LLMTalk(message, currentTurn);
	};

	/**
	 * Send chat to OpenRouter API with retry logic and key rotation
	 * @param {Array} conversationHistory - Conversation messages
	 * @param {Function} onSuccess - Success callback
	 * @param {Function} onError - Error callback
	 * @param {Boolean} [isInitialCall=false] - Whether this is initial call
	 * @param {Number} [retryCount=0] - Current retry count
	 */
	function sendChatToOpenRouter(conversationHistory, onSuccess, onError, isInitialCall, retryCount) {
		isInitialCall = isInitialCall || false;
		retryCount = retryCount || 0;
		var apiKey = getNextKey();
		var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "openai/gpt-4.1";

		// For non-initial calls, replace the system prompt with the regular one
		var messagesToSend = conversationHistory.slice(); // Create a copy
		if (!isInitialCall && messagesToSend.length > 0 && messagesToSend[0].role === "system") {
			messagesToSend[0].content = system_prompt;
		}

		var payload = {
			"model": OR_model,
			"messages": messagesToSend,
			"stream": false
		};

		console.log("Sending to OpenRouter with key index", currentKeyIndex, "retry count:", retryCount, "total retries:", totalRetryCount, ":", payload);

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
				conversationLength: conversationHistory.length,
				retryCount: retryCount,
				currentKeyIndex: currentKeyIndex
			});
			console.log("2-minute timeout reached");
			xhr.abort(); // Cancel the request
			
			// Try with next key if we haven't reached max retries (2)
			if (retryCount < 2) {
				console.log("Timeout occurred, trying with next API key...");
				rotateToNextKey();
				totalRetryCount++;
				sendChatToOpenRouter(conversationHistory, onSuccess, onError, isInitialCall, retryCount + 1);
			} else {
				showExhaustionMessage();
			}
			
		}, timeout_threshold); 

		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				// Clear the timeout since we got a response
				clearTimeout(timeoutId);
				
				console.log("OpenRouter response status:", xhr.status);
				if (xhr.status === 200) {
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
						
						// Call onSuccess. If it throws, it's a DOM issue.
						try {
							onSuccess(data.choices[0].message.content);
						} catch (domErr) {
							logError("DOM_ERROR_IN_SUCCESS", "DOM error while displaying response", turnForThisCall, {
								responseContent: data.choices[0].message.content,
								domError: domErr.message,
								conversationLength: conversationHistory.length,
								retryCount: retryCount,
								currentKeyIndex: currentKeyIndex
							});
							// Hand back to onError to show exhaustion or custom handling, but no key rotation.
							onError("DOM error while displaying response");
						}
						
					} catch (err) {
						logError("JSON_PARSE_ERROR", "Error parsing response: " + err.message, turnForThisCall, {
							responseText: xhr.responseText,
							status: xhr.status,
							conversationLength: conversationHistory.length
						});
						onError("Error parsing response");
						}
				} else {
					logError("HTTP_ERROR", "HTTP " + xhr.status, turnForThisCall, {
						status: xhr.status,
						statusText: xhr.statusText,
						responseText: xhr.responseText,
						conversationLength: conversationHistory.length,
						retryCount: retryCount,
						currentKeyIndex: currentKeyIndex
					});
					
					// Try with next key for certain HTTP errors
					if ((xhr.status === 0 || xhr.status === 401 || xhr.status === 403 || xhr.status >= 500) && retryCount < 2) {
						console.log("HTTP error occurred, trying with next API key...");
						rotateToNextKey();
						totalRetryCount++;
						sendChatToOpenRouter(conversationHistory, onSuccess, onError, isInitialCall, retryCount + 1);
					} else {
						onError("Error: HTTP " + xhr.status);
					}
				}
			}
		};

		xhr.onerror = function() {
			// Clear the timeout since we got an error
			clearTimeout(timeoutId);
			logError("NETWORK_ERROR", "Network error occurred", turnForThisCall, {
				readyState: xhr.readyState,
				conversationLength: conversationHistory.length,
				retryCount: retryCount,
				currentKeyIndex: currentKeyIndex
			});
			
			// Try with next key for network errors
			if (retryCount < 2) {
				console.log("Network error occurred, trying with next API key...");
				rotateToNextKey();
				totalRetryCount++;
				sendChatToOpenRouter(conversationHistory, onSuccess, onError, isInitialCall, retryCount + 1);
			} else {
				Qualtrics.SurveyEngine.setEmbeddedData('network_error_after_two_retries', "true");
				onError("Network error after 2 retries");
			}
		};

		xhr.send(JSON.stringify(payload));
	}

	// Handle LLM conversation turn with user message
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
		
		// Show loading dot safely using renderWithRetry
		renderWithRetry(
			() => document.getElementById(dott_id),
			(dot) => { dot.style.display = "block"; }
		);

		// Determine turn number from LLMposition (e.g., LLM2_msg => 2)
		var turnNumber = parseInt(LLMposition.replace("LLM", "").replace("_msg", ""));

		sendChatToOpenRouter(conversationHistory,
			function(response) {

				// Determine variables for robustness
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
				var dott_id = LLMposition.split("_")[0] + '_dot';

				// Hide loading dot safely
				renderWithRetry(
				  () => document.getElementById(dott_id),
				  (dot) => { dot.style.display = "none"; }
				);
				
				// If currentTurn == 3, append the blurb in italic
				var out = response;
				if (currentTurn === 3) {
					out = response + "<br><br><em>Note that our conversation will end after your next reply.</em>";
				}

				// Render LLM response safely
				renderWithRetry(
				  () => document.getElementById(LLMposition),
				  (llmEl) => {
				    llmEl.innerHTML = out;
				    llmEl.style.display = "block";
					console.log("llmEl:", llmEl);
					console.log("LLM position:", LLMposition);
				  },
				  // Fallback: Hide all interactions and show in LLM1_msg
				  () => {
	      			var interactions = chat.querySelectorAll("div");
	      			for (var i = 0; i < interactions.length; i++) {
        				interactions[i].style.display = "none";
    				}
					console.log("FALLBACK: Hide all interactions due to critical rendering failure");
    				document.getElementById("LLM1_msg").innerHTML = out;
    				document.getElementById("LLM1_msg").style.display = "block";
				  }
				);

				// Add LLM response to conversation history
				conversationHistory.push({"role": "assistant", "content": response});

				console.log("LLM [" + turnNumber + "]: " + response);
				Qualtrics.SurveyEngine.setEmbeddedData('llm_response_' + turnNumber, response);
				
				// Show warning message after LLM response for turn 4
				if (currentTurn === 4) {
					var warningMsg = "That was the last response. Please click 'Next' to continue.";

					renderWithRetry(
					  () => document.getElementById('chatNotice'),
					  (el) => {
					    el.innerHTML = "<em>" + warningMsg + "</em>";
					    el.style.display = "block";
					  }
					);
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
								warningDiv.innerHTML = '<span style="color: red; margin-right: 10px;">If you are not finished, we encourage you to continue the conversation. However, if you would like to exit, you can click the Next button. <em>This action cannot be undone.</em></span>';
								warningDiv.style.display = 'inline-block';
								warningDiv.style.verticalAlign = 'middle';
								nextButton.parentNode.insertBefore(warningDiv, nextButton);
							}
						}, 100);
					}
				}
				
				// Don't re-enable chat input if we've reached the conversation limit
				if (currentTurn < 5) {
					chatInput.disabled = false;
				} else {
					// Conversation has ended, keep chat input disabled
					chatInput.disabled = true;
					submitBtn.disabled = true;
				}
			},
			function(error) {
				logError("EXHAUSTION_ERROR", error, currentTurn, {
					llmPosition: LLMposition,
					conversationLength: conversationHistory.length,
					userMessage: userMessage,
					apiKey: Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') ? "present" : "missing",
					model: Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "default",
					currentKeyIndex: currentKeyIndex
				});
				showExhaustionMessage();
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