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

	llmDot.style.display = "block";
	chatInput.disabled = true;
	submitBtn.disabled = true;

	var initial_opinion = Qualtrics.SurveyEngine.getEmbeddedData('initial_opinion') || 'I believe gun policy should be much stricter...';
	var pid = Qualtrics.SurveyEngine.getEmbeddedData('pid') || 'Democrat';
	var treatment = Qualtrics.SurveyEngine.getEmbeddedData('treatment') || 'outgroup_disagree';
	var group = Qualtrics.SurveyEngine.getEmbeddedData('group') || 'Republican';
	var topic = Qualtrics.SurveyEngine.getEmbeddedData('topic') || 'gun policy';

	console.log('Initial opinion:', initial_opinion);
	console.log('Party ID:', pid);
	console.log('Treatment:', treatment);
	console.log('Group:', group);
	console.log('Topic:', topic);

	var agreeOrDisagree = (treatment === 'ingroup_agree' || treatment === 'outgroup_agree')
		? 'agree with this opinion'
		: 'disagree with this opinion';

	var optional_blurb = (treatment === 'outgroup_agree' || treatment === 'ingroup_disagree')
		? ', even though it is not typical for ' + group + ' to do so. '
		: '';

	var system_prompt = 'You are a chatbot designed to reflect the viewpoints of ' + group + '. ' +
		'You will be having a conversation with a person who is ' + pid + '. ' +
		'Show that a ' + group + ' ' + agreeOrDisagree + optional_blurb + '. ' +
		'Present well-reasoned supporting arguments, one at a time. Maintain respect throughout the conversation and use simple language. ' +
		'Keep your responses concise, under three sentences.';

	console.log('System prompt:', system_prompt);

	sendChatToOpenRouter(
		'Here is my opinion on ' + topic + ': "' + initial_opinion + '"',
		function(response) {
			console.log("Initial LLM response:", response);
			llmDot.style.display = "none";
			document.getElementById("LLM1_msg").innerHTML = response;
			document.getElementById("LLM1_msg").style.display = "block";
			Qualtrics.SurveyEngine.setEmbeddedData('llm_response_0', response);
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
		},
		system_prompt
	);

	function handleInputChange() {
		submitBtn.disabled = (chatInput.value.trim() === '');
	}

	submitBtn.onclick = function() {
		var message = chatInput.value.trim();
		if (!message) return;

		var turnNumber = 1;
		while (document.getElementById('user' + turnNumber + '_msg') &&
			document.getElementById('user' + turnNumber + '_msg').style.display === 'block') {
			turnNumber++;
		}
		if (turnNumber === 5) {
			var warningMsg = "This is your last response. Please click 'Next' to continue.";
			document.getElementById('chatNotice').innerHTML = "<em>" + warningMsg + "</em>";
			document.getElementById('chatNotice').style.display = "block";
		}
		console.log('User turn number:', turnNumber);
		console.log('User message:', message);

		Qualtrics.SurveyEngine.setEmbeddedData('user_response_' + turnNumber, message);
		document.getElementById('user' + turnNumber + '_msg').innerHTML = message;
		document.getElementById('user' + turnNumber + '_msg').style.display = "block";

		chatInput.value = '';
		chat.scrollTop = chat.scrollHeight;
		LLMTalk();
	};

	function sendChatToOpenRouter(userMessage, onSuccess, onError, system_prompt) {
		var apiKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or-...";
		var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "mistralai/mistral-small-3.2-24b-instruct";

		var payload = {
			"model": OR_model,
			"messages": [
				{"role": "system", "content": system_prompt},
				{"role": "user", "content": userMessage}
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

	function LLMTalk() {
		chatInput.disabled = true;
		submitBtn.disabled = true;

		var all_interactions = [];
		var LLMposition = "";
		var interactions = chat.querySelectorAll("div");

		for (var i = 0; i < interactions.length; i++) {
			var node = interactions[i];
			if (!node.id || node.id.endsWith("dot")) continue;

			if (node.innerHTML.trim() === 'LLMPlaceholder') {
				LLMposition = node.id;
				break;
			}
			if (node.id.startsWith("LLM")) all_interactions.push("LLM:" + node.innerHTML);
			else if (node.id.startsWith("user")) all_interactions.push("User:" + node.innerHTML);
		}

		console.log("All interactions:", all_interactions);
		console.log("Next LLM placeholder:", LLMposition);
		
		if (all_interactions.length >= 10 || !LLMposition) {
			console.log("Conversation limit reached or no LLM placeholder found.");

			qThis.showNextButton();
			Qualtrics.SurveyEngine.setEmbeddedData('all_interactions', all_interactions.join("\n"));
			return;
		}


		var dott_id = LLMposition.split("_")[0] + '_dot';
		document.getElementById(dott_id).style.display = "block";

		sendChatToOpenRouter(all_interactions.join("\n"), function(response) {
			document.getElementById(dott_id).style.display = "none";
			document.getElementById(LLMposition).innerHTML = response;
			document.getElementById(LLMposition).style.display = "block";

			var turnNumber = parseInt(LLMposition.replace("LLM", "").replace("_msg", ""));
			console.log("LLM turn number:", turnNumber);
			Qualtrics.SurveyEngine.setEmbeddedData('llm_response_' + turnNumber, response);
			chatInput.disabled = false;
		}, function(error) {
			document.getElementById(dott_id).style.display = "none";
			document.getElementById(LLMposition).innerHTML = error;
			document.getElementById(LLMposition).style.display = "block";
			chatInput.disabled = false;
		});
	}
});