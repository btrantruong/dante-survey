"""
This script is used to test the system prompt. It takes user input and sends it to the OpenRouter API, then saves the conversation history to a file.
Run script from the parent directory using `python3 test_with_user_input.py`
"""

import requests
import json

API_KEY = json.load(open("api_key.json"))["API_KEY"]
url = "https://openrouter.ai/api/v1/chat/completions"
headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def get_system_prompt(pid, treatment, topic, group):
    stance = "agree" if treatment.split("_")[1] == "agree" else "disagree"

    disagree_blurb = (
        "People often assume that in-group members share similar views, while out-group members hold more extreme and opposing positions."
        "In reality, people tend to overestimate how much they agree with in-partisans and underestimate the extent of agreement with out-partisans. For instance, some Democrats support stricter immigration policies, while some Republicans acknowledge human-driven climate change and advocate for responsible measures."
        "Change this misperception by engaging with the partner, even if you don't agree with their viewpoint. "
    )
    agreement_blurb = "Comment on the participant's stance, share your relevant point of view, and encourage them to share their thoughts."

    optional_intro = (
        disagree_blurb if treatment.split("_")[1] == "disagree" else agreement_blurb
    )

    system_prompt = (
        f"You are a discussion partner who holds the values and viewpoints typically associated with {group}. "
        f"You will be having a conversation with a person who is {pid}. "
        + optional_intro
        + f"You represent the stance that {stance}s with the participant's opinion on {topic}. "
        + f"Keep your responses short and concise. Present well-reasoned supporting arguments with concrete examples. Maintain respect throughout the conversation and use simple language that an average person can understand. "
        # + "If the participant is not willing to engage, do not force them. Just say goodbye and end the conversation. "
        + "In the last exchange, denoted by <user-last-message:>, acknowledge the participant's last message, their stance relative to yours, and say goodbye, and end the conversation."
    )
    return system_prompt


def send_to_openrouter(messages):
    """Send messages to OpenRouter API and return the response"""
    payload = {
        "model": "openai/gpt-4.1",
        "messages": messages,
        "stream": False,
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        # Raise an exception for bad status codes
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error sending request to OpenRouter: {e}")
        return None


def chat_with_user(conversationHistory, group, stance):
    """Main chat loop that takes user input and maintains conversation history"""
    print("Welcome to the Dante conversation! Type 'quit' to exit.")
    print("-" * 50)

    while True:
        # Get user input
        user_input = input("\nYou: ").strip()

        # Check if user wants to quit
        if user_input.lower() in ["quit", "exit", "bye", "okay"]:
            print("Goodbye! Thanks for chatting.")
            break

        # Skip empty input
        if not user_input:
            print("Please enter a message.")
            continue

        if len(conversationHistory) >= 8:
            user_input = f"<user-last-message:>" + user_input

        # Add user message to conversation history
        conversationHistory.append({"role": "user", "content": user_input})

        print(
            f"\n Sending to OpenRouter: {user_input} (len convo: {len(conversationHistory)})"
        )

        # Send to OpenRouter
        response = send_to_openrouter(conversationHistory)

        if response:
            try:
                # Extract the assistant's response
                assistant_message = response["choices"][0]["message"]["content"]
                if len(conversationHistory) == 2:
                    assistant_message = (
                        f"From the viewpoint of many {group}, I {stance} with you. "
                        + assistant_message
                    )

                # Add assistant response to conversation history
                conversationHistory.append(
                    {"role": "assistant", "content": assistant_message}
                )

                print(f"\nAssistant: {assistant_message}")

                if (
                    "thank you" in assistant_message.lower()
                    and "goodbye" in assistant_message.lower()
                ):
                    print(
                        "LLM response contains 'thank you' and 'goodbye' - showing Next button"
                    )
                    break

            except (KeyError, IndexError) as e:
                print(f"Error parsing response: {e}")
                print(f"Full response: {response}")
        else:
            print("Failed to get response from OpenRouter")


if __name__ == "__main__":
    topic = "gun policy"
    pids = [
        # "Republican",
        "Democrat"
    ]
    treatments = [
        # "outgroup_disagree",
        "ingroup_disagree",
        "outgroup_agree",
        "ingroup_agree",
    ]

    for treatment in treatments:
        for pid in pids:
            stance = "agree" if treatment.split("_")[1] == "agree" else "disagree"
            if treatment.split("_")[0] == "ingroup":
                if pid == "Republican":
                    group = "Republicans"
                else:
                    group = "Democrats"
            elif treatment.split("_")[0] == "outgroup":
                if pid == "Republican":
                    group = "Democrats"
                else:
                    group = "Republicans"
            print(f"{pid} -- treatment: {treatment}")
            # Initialize conversation history
            conversationHistory = []
            prompt = get_system_prompt(
                pid=pid,
                treatment=treatment,
                topic=topic,
                group=group,
            )
            conversationHistory.append({"role": "system", "content": prompt})

            # Start the chat
            chat_with_user(conversationHistory, group, stance)

            fpath = f"data/convo_{pid.lower()}_{treatment}_v4.json"
            # Optionally save conversation history to file
            try:
                with open(fpath, "w") as f:
                    json.dump(
                        {
                            "pid": pid,
                            "treatment": treatment,
                            "conversationHistory": conversationHistory,
                        },
                        f,
                        indent=2,
                    )
                print(f"\nConversation history saved to {fpath}")
            except Exception as e:
                print(f"Could not save conversation history: {e}")
