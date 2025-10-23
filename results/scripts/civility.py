import pandas as pd
import sys
import os
from openai import OpenAI
import time
from tqdm import tqdm

import dotenv
dotenv.load_dotenv('../../.env')

sys.path.insert(0, '../scripts')
from utils import get_all_interactions, get_interaction_length


fp = "../data/survey/DANTE_Pilot_October 13, 2025_21.48.csv"
df = pd.read_csv(fp)
df = df.drop(index=[0,1])

get_all_interactions(df)

# remove internal test cases
df = df[df['participantId'] != ""]

# remove unfinished cases
df = df[df['Finished']=="True"]

# remove cases with no summary
df = df.dropna(subset=['summary', 'llm_response_1'])

# remove certain participants (HTTP and DOM errors with erroneous interactions)
error = ["6B5DC61D3F1A4FD59884E09A7390D115", "9C157F56FEEC4F22BAFEEC11763B9759", "F6586134F687435A9064E1C721EBC99F", "AF09ECC56B13406EAA4D174850B78291", "F28F21C7F66946B785FCCA3E4AEB26B2"]
duplicate_ip = ['3E8D695768544BFAAB256B25B286BE36', '2C25201441924CD69CFB850F9E0C25B7', 'ADE33812DFEE4679855302BB37ABFF84']
dnf = ['498B2C7CFDC6421A8DE46C96D56EFBB2', '57A3377A53CD49C3A03640AC86E08698', '6AEA21E0CC19480D95EF78972E41A441']
df = df[df['participantId'].apply(lambda x: x not in error + duplicate_ip + dnf)]

# Convo satisfaction to numeric
str_to_num = {"Strongly disagree": 1, "Somewhat disagree": 2, "Neither agree nor disagree": 3, "Somewhat agree": 4, "Strongly agree": 5}

for col in ['satis1', 'satis2']:
    df[col] = df[col].map(str_to_num)

# Treatment labels to more readable format
df['treatment'] = df['treatment'].apply(lambda x: f"{x.split('_')[0].capitalize()} {x.split('_')[1].capitalize()}")

# Average satisfaction
df['satis_avg'] = (df['satis1'] + df['satis2']) / 2

# Agree vs Disagree
df['agree_disagree'] = "Agree"
df.loc[df['treatment'].apply(lambda x: "Disagree" in x), 'agree_disagree'] = "Disagree"

# Ingroup vs Outgroup
df['ingroup_outgroup'] = "Ingroup"
df.loc[df['treatment'].apply(lambda x: "Outgroup" in x), 'ingroup_outgroup'] = "Outgroup"

# Melt the dataframe on user and LLM responses
convo_data = df.melt(id_vars=['participantId', 'treatment'],
                    value_vars=['initial_opinion', 'user_response_1', 'user_response_2', 'user_response_3', 'user_response_4', 'user_response_5',
                                'llm_response_0', 'llm_response_1', 'llm_response_2', 'llm_response_3', 'llm_response_4', 'llm_response_5',])

# drop nan value rows
convo_data = convo_data.dropna()

# rename the columns
convo_data.columns = ["participantID", "treatment", "convo_turn", "message"]

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

# Run moderation on all messages in batches
# Prepare list of messages
messages = convo_data['message'].tolist()

# Batch size
batch_size = 200

# Store all results
all_results = []

# Process in batches
for i in tqdm(range(0, len(messages), batch_size)):
    batch = messages[i:i + batch_size]
    
    try:
        # Send batch to moderation API
        response = client.moderations.create(
            model="omni-moderation-latest",
            input=batch
        )
        
        # Collect results
        all_results.extend(response.results)
        
        # Small delay to avoid rate limiting
        time.sleep(0.5)
        
    except Exception as e:
        print(f"Error processing batch {i//batch_size + 1}: {e}")
        # You might want to handle errors differently depending on your needs
        continue

print(f"Processed {len(all_results)} messages")

# Convert results to DataFrame
moderation_data = []

for idx, result in enumerate(all_results):
    result_dict = {
        'message_index': idx,
        'flagged': result.flagged,
    }
    
    # Add category scores
    if hasattr(result, 'categories'):
        for category, flagged in result.categories.__dict__.items():
            result_dict[f'category_{category}'] = flagged
    
    # Add category scores (numeric)
    if hasattr(result, 'category_scores'):
        for category, score in result.category_scores.__dict__.items():
            result_dict[f'score_{category}'] = score
    
    moderation_data.append(result_dict)

moderation_df = pd.DataFrame(moderation_data)

# Add back to original dataframe
convo_data_with_scores = convo_data.reset_index(drop=True)
convo_data_with_scores = pd.concat([convo_data_with_scores, moderation_df], axis=1)

print(f"Shape: {convo_data_with_scores.shape}")
convo_data_with_scores.head()

convo_data_with_scores.to_csv("../data/civility/convo_data_with_moderation_scores.csv", index=False)