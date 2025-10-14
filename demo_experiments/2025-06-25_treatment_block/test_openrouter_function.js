// Minimal test script for sendChatToOpenRouter function
// This script isolates the function from the Qualtrics environment for testing

// Configuration - Update these values as needed
const CONFIG = {
    apiKey: "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",
    model: "mistralai/mistral-small-3.2-24b-instruct",
    testParams: {
        pid: 'Democrat',
        treatment: 'outgroup_agree',
        group: 'Democrat', 
        topic: 'Gun Rights'
    }
};

// Extracted sendChatToOpenRouter function
async function sendChatToOpenRouter(userMessage, onSuccess, onError) {
    const { pid, treatment, group, topic } = CONFIG.testParams;

    var optional_disagreement_blurb = '';
    if (treatment == 'outgroup_disagree' || treatment == 'ingroup_disagree') {
        optional_disagreement_blurb = `, even though it is not typical for ${group} to do so. `;
    }

    const system_prompt = `You are a chatbot designed to reflect the values and viewpoints typically associated with ${group}. \
    You will be having a conversation with a person who is ${pid} where you show that some ${group} agree with the participant's stance on ${topic}${optional_disagreement_blurb}. \
    Present well-reasoned supporting arguments. Maintain respect throughout the conversation and use simple language that an average person can understand. \
    Nudge the participant towards keeping the conversation going by asking questions and making comments that encourage them to share their thoughts. Keep your responses short and concise.`;

    const url = "https://openrouter.ai/api/v1/chat/completions";
    const headers = {
        "Authorization": `Bearer ${CONFIG.apiKey}`,
        "Content-Type": "application/json"
    };
    
    console.log("Headers:", {
        "Authorization": `Bearer ${CONFIG.apiKey.substring(0, 10)}...`,
        "Content-Type": headers["Content-Type"]
    });
    
    const payload = {
        "model": CONFIG.model,
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

    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error response body:", errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Response data:", data);
        const gptResponse = data.choices[0].message.content;
        onSuccess(gptResponse);
    } catch (error) {
        console.error("Error from OpenRouter:", error);
        onError("Error: " + error.message);
    }
}

// Test function
async function testOpenRouterFunction() {
    console.log("=== Testing OpenRouter Function ===");
    
    const testMessage = "I think everyone should bear arms freely.";
    console.log("Test message:", testMessage);
    
    try {
        await sendChatToOpenRouter(
            testMessage,
            function(response) {
                console.log("✅ SUCCESS - OpenRouter response:");
                console.log(response);
            },
            function(error) {
                console.log("❌ ERROR - OpenRouter error:");
                console.log(error);
            }
        );
    } catch (error) {
        console.log("❌ EXCEPTION - Test failed:");
        console.log(error);
    }
}

// Run the test if this script is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    console.log("Running in browser environment");
    testOpenRouterFunction();
} else {
    // Node.js environment
    console.log("Running in Node.js environment");
    // Note: You'll need to install node-fetch for Node.js
    // npm install node-fetch
    testOpenRouterFunction();
} 