# Test Scripts for sendChatToOpenRouter Function

This directory contains test scripts to verify the functionality of the `sendChatToOpenRouter()` function from the Qualtrics treatment block.

## Files

- `test_sendChatToOpenRouter.js` - Node.js test script
- `test_sendChatToOpenRouter.html` - Browser-based test interface
- `package.json` - Node.js dependencies
- `README_test.md` - This file

## Prerequisites

1. **OpenRouter API Key**: You need a valid OpenRouter API key
   - Sign up at [OpenRouter](https://openrouter.ai/)
   - Get your API key from the dashboard

## Testing Options

### Option 1: Node.js Testing (Recommended)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set your API key**:
   ```bash
   export OPENROUTER_API_KEY="your-api-key-here"
   ```

3. **Run the tests**:
   ```bash
   npm test
   # or
   node test_sendChatToOpenRouter.js
   ```

### Option 2: Browser Testing

1. **Open the HTML file**:
   ```bash
   npm run test:html
   # or open test_sendChatToOpenRouter.html in your browser
   ```

2. **Enter your API key** in the form
3. **Click test buttons** to run different scenarios

## Test Cases

### Test 1: Basic Conversation
- Tests a simple conversation with a helpful assistant
- Verifies basic API communication

### Test 2: Gun Policy Conversation
- Tests the actual conversation scenario from your research
- Uses the Republican/Democrat gun policy prompt
- Verifies the complex system prompt works correctly

### Test 3: Error Handling
- Tests error handling with invalid API key
- Verifies the function properly handles API errors

### Custom Test
- Allows you to test with your own messages
- Useful for debugging specific scenarios

## Expected Results

### Successful Tests
- ✅ Response received from OpenRouter API
- ✅ Proper JSON parsing of response
- ✅ Correct extraction of message content

### Failed Tests
- ❌ Network errors (check internet connection)
- ❌ API key errors (check your OpenRouter API key)
- ❌ Rate limiting (wait and retry)
- ❌ Model errors (check model name)

## Troubleshooting

### Common Issues

1. **"Network error"**
   - Check your internet connection
   - Verify OpenRouter API is accessible

2. **"Error: HTTP 401"**
   - Invalid or missing API key
   - Check your OpenRouter API key

3. **"Error: HTTP 429"**
   - Rate limit exceeded
   - Wait a few minutes and retry

4. **"Error parsing response"**
   - Unexpected API response format
   - Check OpenRouter API documentation

### Debug Information

Both test scripts provide detailed logging:
- Request payload sent to OpenRouter
- Response status codes
- Full API responses
- Parsed data structures

## Integration with Qualtrics

The test scripts mock the Qualtrics environment:
- `Qualtrics.SurveyEngine.getEmbeddedData()` is mocked
- API key and model are retrieved from embedded data
- Error handling matches the original implementation

## Security Notes

- Never commit API keys to version control
- Use environment variables for API keys
- The HTML version stores API key in browser memory only
- Consider using a test API key for development

## Model Options

Common OpenRouter models you can test with:
- `openai/gpt-4o-mini` (recommended for testing)
- `openai/gpt-4o`
- `anthropic/claude-3.5-sonnet`
- `meta-llama/llama-3.1-8b-instruct`

Change the model in the test interface or modify the default in the code. 