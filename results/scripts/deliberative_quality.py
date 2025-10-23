"""
Script to analyze deliberative quality metrics of messages including:
- Emotional tone using pre-trained models
- Sentiment analysis
- Question asking patterns
- Gratitude expressions
- Hedge word usage
- POS tag analysis
"""

import glob
from collections import Counter
from pathlib import Path

import pandas as pd
from nltk import word_tokenize, pos_tag
from transformers import pipeline, AutoModelForSequenceClassification, AutoTokenizer
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


# Constants
MODEL_NAME = "SamLowe/roberta-base-go_emotions"
CACHE_DIR = "/media/volume/data-backup/language_models"
DATA_PATH = Path('../data/civility/convo_data_with_moderation_scores.csv')
RESOURCES_PATH = Path('../../../resources')

GRATITUDE_LEXICON = {
    "thanks", "contented", "blessed", "thank you", "thankful for", 
    "grateful for", "greatful for", "my gratitude", "i appreciate", 
    "made me smile", "make me smile", "i super appreciate", 
    "i deeply appreciate", "i really appreciate", "bless your soul", 
    "made my day", "tysm", "thx", "shout out to"
}


def load_emotion_classifier():
    """Load and return the emotion classification pipeline."""
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, cache_dir=CACHE_DIR
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    classifier = pipeline(
        task="text-classification", 
        model=model, 
        tokenizer=tokenizer, 
        top_k=None, 
        truncation=True
    )
    return classifier


def add_emotion_scores(df, classifier):
    """Add emotion scores to the dataframe."""
    model_outputs = classifier(list(df['message']))
    df['emotion_scores'] = [
        {item['label']: item['score'] for item in output} 
        for output in model_outputs
    ]
    return df


def add_sentiment_scores(df):
    """Add VADER sentiment scores and polarity flags to the dataframe."""
    analyzer = SentimentIntensityAnalyzer()
    df['vader_sentiment'] = df['message'].apply(analyzer.polarity_scores)
    
    # Create binary polarity columns
    df['positive_polarity'] = (
        df['vader_sentiment'].apply(lambda x: x['compound'] > 0)
    ).astype(int)
    df['negative_polarity'] = (
        df['vader_sentiment'].apply(lambda x: x['compound'] < 0)
    ).astype(int)
    
    return df


def add_question_features(df):
    """Add question-related features to the dataframe."""
    df['question_flag'] = df['message'].str.contains('?', regex=False).astype(int)
    df['question_count'] = df['message'].str.count(r'\?')
    return df


def add_gratitude_features(df):
    """Add gratitude-related features to the dataframe."""
    df['gratitude_flag'] = df['message'].apply(
        lambda x: int(any(phrase in x.lower() for phrase in GRATITUDE_LEXICON))
    )
    df['gratitude_count'] = df['message'].apply(
        lambda x: sum(x.lower().count(phrase) for phrase in GRATITUDE_LEXICON)
    )
    
    # Normalize by word count
    word_counts = df['message'].str.split().str.len()
    df['gratitude_ratio'] = df['gratitude_count'] / word_counts.replace(0, 1)
    
    return df


def load_hedge_lexicon():
    """Load hedge words from resource files."""
    lexicon = []
    
    for filepath in RESOURCES_PATH.glob('*'):
        if filepath.is_file():
            name = filepath.stem
            
            with open(filepath, 'r') as f:
                words = [
                    line.strip() for line in f 
                    if line.strip() and not line.startswith('#')
                ]
                
                # Add negation variants for booster words
                if name == 'booster_words':
                    negated = [f"not {word}" for word in words]
                    negated.extend(f"without {word}" for word in words)
                    words.extend(negated)
                
                lexicon.extend(words)
    
    return [word.lower() for word in lexicon]


def add_hedge_features(df, hedge_lexicon):
    """Add hedge word features to the dataframe."""
    df['hedge_flag'] = df['message'].apply(
        lambda x: int(any(hedge in x.lower() for hedge in hedge_lexicon))
    )
    df['hedge_count'] = df['message'].apply(
        lambda x: sum(x.lower().count(hedge) for hedge in hedge_lexicon)
    )
    
    # Normalize by word count
    word_counts = df['message'].str.split().str.len()
    df['hedge_ratio'] = df['hedge_count'] / word_counts.replace(0, 1)
    
    return df


def add_pos_features(df):
    """Add POS tag features to the dataframe."""
    df['pos_tags'] = df['message'].apply(
        lambda x: pos_tag(word_tokenize(x, language='english'))
    )
    df['pos_tag_counts'] = df['pos_tags'].apply(
        lambda x: Counter(tag for _, tag in x)
    )

    return df


def main():
    """Main function to orchestrate the analysis."""
    # Load data
    print("Loading data...")
    df = pd.read_csv(DATA_PATH)
    
    # Load models and lexicons
    print("Loading emotion classifier...")
    classifier = load_emotion_classifier()
    
    print("Loading hedge lexicon...")
    hedge_lexicon = load_hedge_lexicon()
    
    # Add features
    print("Adding emotion scores...")
    df = add_emotion_scores(df, classifier)
    
    print("Adding sentiment scores...")
    df = add_sentiment_scores(df)
    
    print("Adding question features...")
    df = add_question_features(df)
    
    print("Adding gratitude features...")
    df = add_gratitude_features(df)
    
    print("Adding hedge features...")
    df = add_hedge_features(df, hedge_lexicon)
    
    print("Adding POS features...")
    df = add_pos_features(df)
    
    # Save results
    print(f"Saving results to {DATA_PATH}...")
    df.to_parquet(DATA_PATH, index=False)
    print("Done!")

if __name__ == '__main__':
    main()