use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::{
    constants::{ESCROW_SEED, GROUP_SIZE},
    error::AjoError,
    state::Group,
};

#[event]
pub struct ContributionMade {
    pub group: Pubkey,
    pub member: Pubkey,
    pub round: u8,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub member: Signer<'info>,
    #[account(mut)]
    pub group: Account<'info, Group>,
    /// CHECK: escrow is a bare system-owned PDA vault, verified by seeds
    #[account(mut, seeds = [ESCROW_SEED, group.key().as_ref()], bump)]
    pub escrow: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_contribute(ctx: Context<Contribute>) -> Result<()> {
    let group = &mut ctx.accounts.group;
    require!(!group.completed, AjoError::GroupCompleted);

    let member_key = ctx.accounts.member.key();
    let idx = (0..GROUP_SIZE)
        .find(|&i| group.members[i] == member_key)
        .ok_or(AjoError::NotAMember)?;

    // Contributions are always accepted, even after the deadline: a missed
    // deadline permanently flags a member as defaulted (see mark_default),
    // but it does not lock them out of paying in and unblocking the round.
    require!(!group.has_contributed[idx], AjoError::AlreadyContributed);

    let cpi_accounts = Transfer {
        from: ctx.accounts.member.to_account_info(),
        to: ctx.accounts.escrow.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.system_program.key(), cpi_accounts);
    system_program::transfer(cpi_ctx, group.contribution_amount)?;

    group.has_contributed[idx] = true;

    emit!(ContributionMade {
        group: group.key(),
        member: member_key,
        round: group.round_number,
    });

    msg!(
        "Member {} contributed for round {} of group {}",
        member_key,
        group.round_number,
        group.key()
    );

    Ok(())
}
