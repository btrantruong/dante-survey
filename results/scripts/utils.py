import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

def get_interaction_length(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate the length of user and LLM interactions
    df: DataFrame containing the data.
    Returns the DataFrame with additional columns for interaction lengths:
    - interaction_length: Dictionary with lengths of each user and LLM response
    - avg_user_response_length: Average length of user responses
    - avg_llm_response_length: Average length of LLM responses
    - initial_opinion_length: Length of the initial opinion
    """
    # Make a copy to avoid modifying the original dataframe
    df = df.copy()

    # Calculate lengths
    df['interaction_length'] = None
    for idx, row in df.iterrows():
        lens = {"user":[],"llm":[]}
        lens["user"].append(len(row['initial_opinion']))
        for i in range(1, 6):
            user_col = f'user_response_{i}'
            llm_col = f'llm_response_{i}'
            if pd.notna(row[user_col]):
                lens["user"].append(len(row[user_col]))
            if pd.notna(row[llm_col]):
                lens["llm"].append(len(row[llm_col]))
        df.at[idx, 'interaction_length'] = lens
    
    # Calculate average lengths
    for counterpart in ['user', 'llm']:
        df[f'avg_{counterpart}_response_length'] = df['interaction_length'].apply(lambda x: np.mean(x[counterpart]))

    # Get initial opinion length
    df['initial_opinion_length'] = df['interaction_length'].apply(lambda x: x['user'][0])
    
    return df

def get_all_interactions(df):
    """Combine all user and LLM interactions into a single string for each row"""
    df['all_interactions'] = ""
    for idx, row in df.iterrows():
        interactions = []
        interactions.append(f"Initial Opinion: {row['initial_opinion']}")    
        for i in range(1, 6):
            user_col = f'user_response_{i}'
            llm_col = f'llm_response_{i}'
            if pd.notna(row[user_col]):
                interactions.append(f"User: {row[user_col]}")
            if pd.notna(row[llm_col]):
                interactions.append(f"LLM: {row[llm_col]}")
        df.at[idx, 'all_interactions'] = "\n".join(interactions)

def load_data(fp, min_time=180, max_time=3600):
    df = pd.read_csv(fp)
    df.drop(index=[0,1], inplace=True)

    df['treatment_group'] = df['treatment'] + ' - ' + df['pid']

    # Filter to only include Democrats and Republicans
    df = df[(df['pid']=='Democrat') | (df['pid']=='Republican')]

    # get all interactions
    get_all_interactions(df)

    # Do not remove rows with DOM_ELEMENT_NOT_FOUND errors
    df.loc[df['error_log'].apply(lambda x: 'DOM_ELEMENT_NOT_FOUND' in str(x)), 'error_log'] = np.nan

    # Remove rows with errors
    df = df[(df['error_log'].isna())]

    # Keep only finished surveys
    df = df[df['Finished'] == 'True']

    # Filter based on duration
    df['Duration (in seconds)'] = df['Duration (in seconds)'].astype(float)
    df = df[(df['Duration (in seconds)'] <= max_time) & (df['Duration (in seconds)'] >= min_time)]

    # Remove duplicate IP addresses
    df = df.drop_duplicates(subset=['IPAddress'], keep=False)

    # Convert relevant columns to numeric and drop rows with NaN values in those columns
    cols_to_convert = ['pre_feel_rep_1', 'post_feel_rep_1', 'pre_feel_dem_1', 'post_feel_dem_1']
    for col in cols_to_convert:
        df[col] = df[col].astype(float)
        df.dropna(subset=[col], inplace=True)

    # distinguish agree/disagree and ingroup/outgroup
    df['agree_disagree'] = df['treatment'].apply(lambda x: 'Agree' if '_agree' in x else 'Disagree')
    df['ingroup_outgroup'] = df['treatment'].apply(lambda x: 'Ingroup' if 'ingroup' in x else 'Outgroup')

    return df

def add_significance_bracket(ax, x1, x2, y, h, p_val):
    """Add significance bracket between two positions"""
    ax.plot([x1, x1, x2, x2], [y, y+h, y+h, y], lw=1, c='black')
    # Format p-value
    if p_val < 0.001:
        sig_text = 'p<0.001'
    elif p_val < 0.01:
        sig_text = f'p<0.01'
    elif p_val < 0.05:
        sig_text = f'p<0.05'
    else:
        sig_text = f'p={p_val:.2f}'
    ax.text((x1+x2)*.5, y+h, sig_text, ha='center', va='bottom', fontsize=10)

def bootstrap(df: pd.DataFrame, column:str, N:int = 1000, sample_size:int = 500):
    """Bootstrap resampling for a given column in a DataFrame.
    df: DataFrame containing the data.
    column: Column name to perform bootstrap on.
    N: Number of bootstrap iterations.
    sample_size: Number of samples to draw in each iteration.
    Returns a dictionary with bootstrap results for each group.
    """
    bootstraps = []
    for i in range (N):
        bootstraps.append(df[column].sample(sample_size, replace=True).mean().item())
    
    return bootstraps

def bootstrap_by_agreement_and_group(df: pd.DataFrame, column:str, N:int = 1000, sample_size:int = 500):
    """Bootstrap resampling for a given column in a DataFrame.
    df: DataFrame containing the data.
    column: Column name to perform bootstrap on.
    N: Number of bootstrap iterations.
    sample_size: Number of samples to draw in each iteration.
    Returns a dictionary with bootstrap results for each group and condition.
    """
    bootstraps = {}
    
    for group in ["Ingroup", "Outgroup"]:
        for agree in ["Agree", "Disagree"]:
            tmp = df[(df['ingroup_outgroup'] == group) & (df['agree_disagree'] == agree)]
            _ = bootstrap(tmp, column, N, sample_size)
            bootstraps[(group, agree)] = _
    
    return bootstraps