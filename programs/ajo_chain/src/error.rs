use anchor_lang::prelude::*;

#[error_code]
pub enum AjoError {
    #[msg("Members must be 5 unique, non-default public keys")]
    InvalidMembers,
    #[msg("Contribution amount must be greater than zero")]
    InvalidContributionAmount,
    #[msg("Round duration must be greater than zero")]
    InvalidRoundDuration,
    #[msg("Signer is not a member of this group")]
    NotAMember,
    #[msg("Member has already contributed this round")]
    AlreadyContributed,
    #[msg("The contribution deadline for this round has not passed yet")]
    DeadlineNotPassed,
    #[msg("Not all members have contributed this round")]
    NotAllContributed,
    #[msg("Recipient does not match the member next in rotation order")]
    InvalidRecipient,
    #[msg("This group has completed all rounds")]
    GroupCompleted,
}
