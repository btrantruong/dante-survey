#*******************************************************************************
# Author: Do Won Kim (dowonkim@umd.edu)
# Date: 2025-10-13
# Description: Preprocessing Main Study Data 
#*******************************************************************************

# Load packages 
if (!require("pacman")) install.packages("pacman")
pacman::p_load(
  conflicted,    # Avoid conflict of functions with same names
  tidyverse,     # Tidyverse umbrella package
  readr,         # read_csv()
  haven,         # read_dta()
  infer,         # chisq_test() 
  sjPlot,        # tab_xtab()
  kableExtra,    # kbl()
  gtsummary,     # tbl_summary()  
  glmnet,        # lasso covariates
  lmtest,        # robust se
  sandwich,      # robust se
  broom,         # tidy()
  multcomp,      # glth() - general linear hypotheses
  estimatr,      # lm_robust() 
  ggplot2, 
  ggthemes
)  

conflict_prefer("select", "dplyr")
conflict_prefer("filter", "dplyr")


# Load Qualtrics data (SPSS file)
df <- read_sav("Main/DANTE_Main.sav")

# Load User Info (csv file)
user_info <- read_csv("Main/User_Info.csv") |> 
  rename(participantId = ParticipantId) |> 
  select(participantId, CompletionCode, Age:`Employment Status`)

# Preprocessing 
df |> 
  merge(user_info, by = "participantId", all.x = TRUE) |> 
  filter(participantId != "") |> # Remove internal test cases
  filter(CompletionCode != "12FB757AF3") |> # Remove partial completes (screened out) 
  # One participant: Site unreachable - though paid since spent lots of time ... 
  filter(Finished != 0) |> # There is one participant who submitted the Completion Code correctly but in Qualtrics, they never finished the survey (only consent)
  # Thus in CloudResearch Connect, we have N=2,050 completers but 
  # in this data frame, we have N=2,048
  rename(
    partisanship = pid.0,
    pre_trust_in_AI = pre_AI_trust.0
  ) |> 
  mutate(
    # Treatment ================================================================
    # Factor 1. Group = “Ingroup” (0) or “Outgroup” (1) 
    # Factor 2. Stance = “Agree” (0) or “Disagree” (1)  
    group = as.factor(ifelse(treatment == "ingroup_agree" | 
                               treatment == "ingroup_disagree", 0, 1)),
    stance = as.factor(ifelse(treatment == "ingroup_agree" |
                                treatment == "outgroup_agree", 0, 1)), 
    # Outcomes =================================================================
    # Primary - Political Polarization -----------------------------------------
    # Affective polarization 
    ingroup_love = ifelse(ingroup == "Democrat", post_feel_dem_1, post_feel_rep_1),
    outgroup_hate = ifelse(ingroup == "Democrat", post_feel_rep_1, post_feel_dem_1), 
    affective_polarization = ingroup_love - outgroup_hate,
    
    
    # Perceived (issue) polarization 
    perceived_issue_polarization = abs(post_issue_meta_dem_1 - post_issue_meta_rep_1), 
    ingroup_homogeneity = ifelse(ingroup == "Democrat", 
                                 -abs(post_issue_1 - post_issue_meta_dem_1),
                                 -abs(post_issue_1 - post_issue_meta_rep_1)),
    outgroup_extremity = ifelse(ingroup == "Democrat", 
                                abs(post_issue_1 - post_issue_meta_rep_1), 
                                abs(post_issue_1 - post_issue_meta_dem_1)), 
    
    # Issue-based persuasion 
    persuasion = ifelse(pre_issue_1 <= 50, post_issue_1 - pre_issue_1, pre_issue_1 - post_issue_1), 
    
    # Behavioral intention (Future willingness to engage) 
    future_willingness = (post_dis_AI_trust_1 - 10),
    
    # Secondary - Anti-Democratic Attitudes ------------------------------------
    anti_democratic_1 = rowMeans(across(post_supviol1_1:post_supviol2_1), na.rm = TRUE),
    anti_democratic_2 = rowMeans(across(post_supundem1_1:post_supundem2_1), na.rm = TRUE),
    
    # Tertiary - Discussion Quality  -------------------------------------------
    discussion_satisfaction  = rowMeans(across(satis1:satis2), na.rm = TRUE),
    # df$satis_op (open-ended)& df$all_interactions -> IU folks!
    
    
    # Controls =================================================================
    # Demographics -------------------------------------------------------------
    # Check: : age, male, hispanic, nonwhite, college graduate  
    age = Age, 
    male = ifelse(Sex == "Male", 1, 0), 
    hispanic = ifelse(Ethnicity == "No, not of Hispanic, Latino, or Spanish origin" | 
                        Ethnicity == " Prefer not to say", 0, 1),
    nonwhite = ifelse(Race == "White", 0, 1), 
    college_grad = ifelse(Education == "Bachelor's degree (for example: BA, AB, BS)" |
                            Education == "Doctorate degree (for example: PhD, EdD)" | 
                            Education == "Master's degree (for example: MA, MS, MEng, MEd, MSW, MBA)" |
                            Education == "Professional degree (for example: MD, DDS, DVM, LLB, JD)", 1, 0), 
  
    # ideology (reverse-code)
    ideology = (8-ideology),
    
    # Pre-treatment outcomes (if available) ------------------------------------
    pre_ingroup_love = ifelse(ingroup == "Democrat", pre_feel_dem_1, pre_feel_rep_1),
    pre_outgroup_hate = ifelse(ingroup == "Democrat", pre_feel_rep_1, pre_feel_dem_1), 
    pre_affective_polarization = pre_ingroup_love - pre_outgroup_hate,
    
    pre_perceived_issue_polarization = abs(pre_issue_meta_dem_1 - pre_issue_meta_rep_1), 
    pre_ingroup_homogeneity = ifelse(ingroup == "Democrat", 
                                     -abs(pre_issue_1 - pre_issue_meta_dem_1),
                                     -abs(pre_issue_1 - pre_issue_meta_rep_1)),
    pre_outgroup_extremity = ifelse(ingroup == "Democrat", 
                                    abs(pre_issue_1 - pre_issue_meta_rep_1), 
                                    abs(pre_issue_1 - pre_issue_meta_dem_1)), 
    
    # Block (partisanship x trust in AI) indicator -----------------------------
    block = as.factor(case_when(
      partisanship == "Democrat" & pre_trust_in_AI == "Yes" ~ "block1",
      partisanship == "Republican" & pre_trust_in_AI == "Yes" ~ "block2",
      partisanship == "Democrat" & pre_trust_in_AI == "No" ~ "block3",
      partisanship == "Republican" & pre_trust_in_AI == "No" ~ "block4",
    )),
    
    # Other ====================================================================
    # Post AI trust ------------------------------------------------------------
    # rescale to 5-point 
    across(post_dis_AI_trust_2:post_dis_AI_trust_5, ~ .x - 10),
    # reverse-code: post_dis_AI_trust_4
    post_dis_AI_trust_4 = (6-post_dis_AI_trust_4),
    # mean across items 
    post_AI_trust = rowMeans(across(post_dis_AI_trust_2:post_dis_AI_trust_5), na.rm = TRUE),
    
    
    # Manipulation Checks ------------------------------------------------------
    issue_stance_alignment = case_when(
      mani_check1 == 1 & treatment %in% c("ingroup_agree", "outgroup_agree") ~ 1,
      mani_check1 == 2 & treatment %in% c("ingroup_disagree", "outgroup_disagree") ~ 1,
      TRUE ~ 0
    ),
    
    AI_representing_well = mani_check2 
  ) |>
  filter(summary != "") |> # Remove summary error (N=50)
  filter(llm_response_1 !="") |>  # Remove treatment block error (N=15)
  select(
    # Meta Info 
    partisanship, participantId:EndDate, Duration__in_seconds_, 
    # Treatment
    treatment, group, stance, 
    
    # Outcome 1. Political Polarization 
    ingroup_love:future_willingness, 
   
    # Outcome 2. Anti-Democratic Attitudes 
    anti_democratic_1:anti_democratic_2, 
    
    # Outcome 3. Discussion Quality
    discussion_satisfaction, satis_op, llm_response_0:all_interactions,
    
    # Misc outcome
    post_AI_trust,
    
    # Covariates 
    block, pre_trust_in_AI, 
    pre_ingroup_love:pre_outgroup_extremity,
    ideology, age, male, hispanic, nonwhite, college_grad, 
    
    # Manipulation Checks
    issue_stance_alignment, AI_representing_well, 
    
    # Summary 
    summary:topic, 
    # Treatment Block Meta 
    turn_1_response_received:all_openrouter_response_times, 
    # Error logs
    error_log:last_error, feedback
    ) |>
  as_tibble() -> MainStudy_df


# Save dataframe 
saveRDS(MainStudy_df, file = "Main/MainStudy_df.rds")
write.csv(MainStudy_df, file = "Main/MainStudy_df.csv", row.names = FALSE)
