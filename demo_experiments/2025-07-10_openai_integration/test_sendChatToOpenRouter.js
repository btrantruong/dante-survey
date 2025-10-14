// Test script for sendChatToOpenRouter function
// This script tests the sendChatToOpenRouter function independently of Qualtrics

// Mock Qualtrics environment for testing
global.Qualtrics = {
    SurveyEngine: {
        getEmbeddedData: function(key) {
            const mockData = {
                'OpenRouterAPIKey': process.env.OPENROUTER_API_KEY || 'sk-or-test-key',
                'setModel': 'openai/gpt-4o-mini'
            };
            return mockData[key] || null;
        }
    }
};

// Mock XMLHttpRequest for Node.js environment
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
global.XMLHttpRequest = XMLHttpRequest;

// Import the function (we'll need to extract it from the original file)
function sendChatToOpenRouter(conversationHistory, onSuccess, onError) {
    var apiKey = Qualtrics.SurveyEngine.getEmbeddedData('OpenRouterAPIKey') || "sk-or-...";
    var OR_model = Qualtrics.SurveyEngine.getEmbeddedData('setModel') || "openai/gpt-4.1";

    var payload = {
        "model": OR_model,
        "messages": conversationHistory,
        "stream": false
    };

    console.log("Sending to OpenRouter:", JSON.stringify(payload, null, 2));

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "https://openrouter.ai/api/v1/chat/completions", true);
    xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log("OpenRouter response status:", xhr.status);
            if (xhr.status === 200) {
                console.log("OpenRouter response:", xhr.responseText);
                try {
                    var data = JSON.parse(xhr.responseText);
                    console.log("Parsed data:", data);
                    onSuccess(data.choices[0].message.content);
                } catch (err) {
                    console.error("Error parsing response:", err);
                    onError("Error parsing response");
                }
            } else {
                console.error("HTTP Error:", xhr.status, xhr.responseText);
                onError("Error: HTTP " + xhr.status);
            }
        }
    };

    xhr.onerror = function() {
        console.error("Network error occurred");
        onError("Network error");
    };

    xhr.send(JSON.stringify(payload));
}

// Test cases
function runTests() {
    console.log("=== Testing sendChatToOpenRouter Function ===\n");

    // Test 1: Basic conversation
    console.log("Test 1: Basic conversation");
    const testConversation1 = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, how are you?"}
    ];

    sendChatToOpenRouter(
        testConversation1,
        function(response) {
            console.log("✅ Test 1 SUCCESS - Response received:", response.substring(0, 100) + "...");
        },
        function(error) {
            console.log("❌ Test 1 FAILED - Error:", error);
        }
    );

    // Test 2: Complex conversation (gun policy example from original code)
    console.log("\nTest 2: Complex conversation (gun policy)");
    const testConversation2 = [
        {
            "role": "system", 
            "content": "You are a chatbot designed to reflect the values and viewpoints typically associated with Republican. You will be having a conversation with a person who is Democrat where you show that some Republican disagree with the participant's stance on gun policy. Present well-reasoned supporting arguments. Maintain respect throughout the conversation and use simple language that an average person can understand. Nudge the participant towards keeping the conversation going by asking questions and making comments that encourage them to share their thoughts. Keep your responses short and concise."
        },
        {
            "role": "user", 
            "content": "On the topic of gun policy, I think that I believe gun policy should be much stricter and we need more comprehensive background checks."
        }
    ];

    sendChatToOpenRouter(
        testConversation2,
        function(response) {
            console.log("✅ Test 2 SUCCESS - Response received:", response.substring(0, 100) + "...");
        },
        function(error) {
            console.log("❌ Test 2 FAILED - Error:", error);
        }
    );

    // Test 3: Error handling - invalid API key
    console.log("\nTest 3: Error handling with invalid API key");
    const originalGetEmbeddedData = Qualtrics.SurveyEngine.getEmbeddedData;
    Qualtrics.SurveyEngine.getEmbeddedData = function(key) {
        if (key === 'OpenRouterAPIKey') {
            return 'invalid-key-for-testing';
        }
        return originalGetEmbeddedData(key);
    };

    sendChatToOpenRouter(
        [{"role": "user", "content": "Test message"}],
        function(response) {
            console.log("❌ Test 3 FAILED - Should have failed with invalid key");
        },
        function(error) {
            console.log("✅ Test 3 SUCCESS - Error properly handled:", error);
        }
    );

    // Restore original function
    Qualtrics.SurveyEngine.getEmbeddedData = originalGetEmbeddedData;
}

// Run tests if this file is executed directly
if (require.main === module) {
    // Check if API key is set
    if (!process.env.OPENROUTER_API_KEY) {
        console.log("⚠️  Warning: OPENROUTER_API_KEY environment variable not set.");
        console.log("   Set it with: export OPENROUTER_API_KEY='your-api-key'");
        console.log("   Tests will run with mock key and likely fail.\n");
    }

    runTests();
}

module.exports = { sendChatToOpenRouter }; 