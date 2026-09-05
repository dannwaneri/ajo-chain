pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT");

#[program]
pub mod ajo_chain {
    use super::*;

    pub fn create_group(
        ctx: Context<CreateGroup>,
        group_id: u64,
        members: [Pubkey; crate::constants::GROUP_SIZE],
        contribution_amount: u64,
        round_duration_secs: i64,
    ) -> Result<()> {
        crate::instructions::create_group::handle_create_group(
            ctx,
            group_id,
            members,
            contribution_amount,
            round_duration_secs,
        )
    }

    pub fn contribute(ctx: Context<Contribute>) -> Result<()> {
        crate::instructions::contribute::handle_contribute(ctx)
    }

    pub fn mark_default(ctx: Context<MarkDefault>) -> Result<()> {
        crate::instructions::mark_default::handle_mark_default(ctx)
    }

    pub fn release_payout(ctx: Context<ReleasePayout>) -> Result<()> {
        crate::instructions::release_payout::handle_release_payout(ctx)
    }
}
