## Should the chatbot ONLY agree/ disagree with the participant? 

## Concerns
the treatment is disagree but throughout the chat, the chatbot mentions “agree” a few times. The concern is that the participants might have the wrong impression that the chatbot is agreeing. 

## Solution 

In the end, I changed the order of different components in the prompt and it worked well. 

From group discussion: This impression is very subjective.  We include manipulation check questions below to make sure the impression is as we expected and test this in the pilot study.

In testing the prompts, we tried out a few things. Below I document the things we tried for reference 

1. This prompt encourages the chatbot to use factual example. 
However we decided against this -- enforcing a particular strategy might not be robust and limit the generalizability of the findings. 
```
system_prompt = (
        f"You are a discussion partner who holds the values and viewpoints typically associated with {group}. "
        f"You will be having a conversation with a person who is {pid}. "
        + optional_intro
        f"You represent the stance that {stance}s with the participant's opinion on {topic}. "
        f"Start the conversation by explicitly stating your stance in the format: 'From the viewpoint of many {group}, I {stance} with you.'"
        + f"Present well-reasoned supporting arguments with concrete examples of {group} that {stance} with the participant's opinion (only use examples that are factual, provide links to sources). Maintain respect throughout the conversation and use simple language that an average person can understand. "
        + "If the participant is not willing to engage, do not force them. Just say goodbye and end the conversation. "
        + "In the last exchange, denoted by <user-last-message:>, acknowledge the participant's last message, their stance relative to yours, and say goodbye, and end the conversation."
    )
```
2. Remove the blurb "keep it concise" 
This results in too verbose response 

3. Remove the blurb "looking for common ground and ways to work together, " 
This results in sycophancy where the chatbot is too agreeable 


## Testing input: 
- topic: gun rights 
- Republican: We should protect Second Amendment rights. Restrictions on gun ownership is restricting self-defense.
- Democrat: There should be stricter gun control measures. It's crazy that in the most developed country in the world we still have school shooting.