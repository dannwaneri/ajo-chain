use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::{
    constants::{ESCROW_SEED, GROUP_SIZE},
    error::AjoError,
    state::Group,
};

#[event]
pub struct PayoutReleased {
    pub group: Pubkey,
    pub recipient: Pubkey,
    pub round: u8,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct ReleasePayout<'info> {
    /// Anyone may crank this once every member has contributed — the recipient
    /// is fixed on-chain by rotation order, this account cannot redirect funds.
    pub caller: Signer<'info>,
    #[account(mut)]
    pub group: Account<'info, Group>,
    /// CHECK: escrow is a bare system-owned PDA vault, verified by seeds
    #[account(mut, seeds = [ESCROW_SEED, group.key().as_ref()], bump)]
    pub escrow: SystemAccount<'info>,
    /// CHECK: validated against group.members[round_number] in the handler
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_release_payout(ctx: Context<ReleasePayout>) -> Result<()> {
    let group = &mut ctx.accounts.group;
    require!(!group.completed, AjoError::GroupCompleted);
    require!(
        group.has_contributed.iter().all(|&c| c),
        AjoError::NotAllContributed
    );
    require!(
        ctx.accounts.recipient.key() == group.members[group.round_number as usize],
        AjoError::InvalidRecipient
    );

    let amount = group
        .contribution_amount
        .checked_mul(GROUP_SIZE as u64)
        .ok_or(AjoError::InvalidContributionAmount)?;

    let group_key = group.key();
    let escrow_seeds: &[&[u8]] = &[
        ESCROW_SEED,
        group_key.as_ref(),
        &[ctx.bumps.escrow],
    ];

    invoke_signed(
        &system_instruction::transfer(&ctx.accounts.escrow.key(), &ctx.accounts.recipient.key(), amount),
        &[
            ctx.accounts.escrow.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[escrow_seeds],
    )?;

    let round = group.round_number;
    let recipient = ctx.accounts.recipient.key();

    group.round_number = group.round_number.checked_add(1).unwrap();
    group.has_contributed = [false; GROUP_SIZE];
    group.round_deadline = Clock::get()?
        .unix_timestamp
        .checked_add(group.round_duration_secs)
        .ok_or(AjoError::InvalidRoundDuration)?;
    if group.round_number as usize == GROUP_SIZE {
        group.completed = true;
    }

    emit!(PayoutReleased {
        group: group_key,
        recipient,
        round,
        amount,
    });

    msg!(
        "Payout of {} lamports released to {} for round {} of group {}",
        amount,
        recipient,
        round,
        group_key
    );

    Ok(())
}
