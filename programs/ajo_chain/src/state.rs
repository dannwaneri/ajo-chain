use anchor_lang::prelude::*;

use crate::constants::GROUP_SIZE;

#[account]
#[derive(InitSpace)]
pub struct Group {
    pub creator: Pubkey,
    pub group_id: u64,
    pub members: [Pubkey; GROUP_SIZE],
    pub contribution_amount: u64,
    pub round_number: u8,
    pub round_deadline: i64,
    pub round_duration_secs: i64,
    pub has_contributed: [bool; GROUP_SIZE],
    pub defaulted: [bool; GROUP_SIZE],
    pub completed: bool,
}
