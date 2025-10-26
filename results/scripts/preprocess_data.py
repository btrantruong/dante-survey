import pandas as pd


def load_data():
    """Load and merge survey and user info datasets."""
    survey = pd.read_csv("../data/raw/DANTE_Pilot_October 13, 2025_21.48.csv")
    user_info = pd.read_csv("../data/raw/User_Info.csv")
    
    # Drop metadata rows
    survey = survey.drop(index=[0, 1])
    
    # Prepare user_info for merge
    user_info = user_info.rename(columns={'ParticipantId': 'participantId'})
    user_info = user_info.drop(columns=['Status'])
    
    # Merge datasets
    return survey.merge(user_info, on="participantId", how="left")


def clean_survey_data(survey):
    """Apply all cleaning filters to survey data."""
    # Rename initial_opinion column
    survey['user_response_1'] = survey['initial_opinion']
    survey = survey.drop(columns=['initial_opinion'])
    
    # Filter out invalid participants
    survey = survey[survey['participantId'].notna() & (survey['participantId'] != '')]
    
    # Remove partial completes
    survey = survey[(survey['CompletionCode'] != "12FB757AF3") & survey['CompletionCode'].notna()]
    
    # Keep only finished surveys
    survey['Finished'] = survey['Finished'].apply(lambda x: eval(x))
    survey = survey[survey['Finished']]
    
    # Remove missing summaries and LLM responses
    survey = survey[survey['summary'].notna() & (survey['summary'] != '')]
    survey = survey[survey['llm_response_1'].notna() & (survey['llm_response_1'] != '')]
    
    return survey

def remove_incomplete_llm_interactions(df):
    """Remove participants with no LLM response to their message."""
    mask = pd.Series(True, index=df.index)
    
    for i in range(1, 6):
        user_col = f'user_response_{i}'
        llm_col = f'llm_response_{i}'
        
        has_user = df[user_col].notna() & (df[user_col] != '')
        missing_llm = df[llm_col].isna() | (df[llm_col] == '')
        mask &= ~(has_user & missing_llm)
    
    removed_count = (~mask).sum()
    print(f"Removed {removed_count} participants with incomplete LLM interactions")
    
    return df[mask]

def ensure_integer_columns(df):
    """Ensure relevant columns are integers."""
    for col in ['pre_issue_1', 'post_issue_1',
                'pre_issue_meta_dem_1', 'pre_issue_meta_rep_1',
                'post_issue_meta_dem_1', 'post_issue_meta_rep_1',
                'pre_feel_dem_1', 'pre_feel_rep_1', 'post_feel_dem_1', 'post_feel_rep_1',
                'post_supviol1_1', 'post_supviol2_1', 'post_supundem1_1', 'post_supundem2_1']:
        df[col] = df[col].astype(float)
    return df

def main(remove_incomplete=False, remove_duplicate_ips=False):
    """Main preprocessing pipeline."""
    df = load_data()
    df = clean_survey_data(df)
    df = ensure_integer_columns(df)
    if remove_incomplete:
        df = remove_incomplete_llm_interactions(df)
    if remove_duplicate_ips:
        df = df.drop_duplicates(subset=['IPAddress'], keep=False)
    df.to_parquet("../data/processed/cleaned_survey_data.parquet", index=False)
    print(f"Saved {len(df)} cleaned survey responses")

if __name__ == "__main__":
    main()