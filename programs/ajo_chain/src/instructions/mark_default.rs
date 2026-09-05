use anchor_lang::prelude::*;

use crate::{constants::GROUP_SIZE, error::AjoError, state::Group};

#[event]
pub struct MemberDefaulted {
    pub group: Pubkey,
    pub member: Pubkey,
    pub round: u8,
}

#[derive(Accounts)]
pub struct MarkDefault<'info> {
    /// Anyone may call this once the round deadline has passed — it only records
    /// on-chain fact, it does not move funds or require special authority.
    pub caller: Signer<'info>,
    #[account(mut)]
    pub group: Account<'info, Group>,
}

pub fn handle_mark_default(ctx: Context<MarkDefault>) -> Result<()> {
    let group = &mut ctx.accounts.group;
    require!(!group.completed, AjoError::GroupCompleted);

    let now = Clock::get()?.unix_timestamp;
    require!(now > group.round_deadline, AjoError::DeadlineNotPassed);

    let round = group.round_number;
    let group_key = group.key();
    for i in 0..GROUP_SIZE {
        if !group.has_contributed[i] && !group.defaulted[i] {
            group.defaulted[i] = true;
            emit!(MemberDefaulted {
                group: group_key,
                member: group.members[i],
                round,
            });
            msg!("Member {} defaulted on round {}", group.members[i], round);
        }
    }

    Ok(())
}
