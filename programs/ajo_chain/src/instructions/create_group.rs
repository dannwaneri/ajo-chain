use anchor_lang::prelude::*;

use crate::{
    constants::{GROUP_SEED, GROUP_SIZE},
    error::AjoError,
    state::Group,
};

#[derive(Accounts)]
#[instruction(group_id: u64)]
pub struct CreateGroup<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Group::INIT_SPACE,
        seeds = [GROUP_SEED, creator.key().as_ref(), &group_id.to_le_bytes()],
        bump
    )]
    pub group: Account<'info, Group>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_group(
    ctx: Context<CreateGroup>,
    group_id: u64,
    members: [Pubkey; GROUP_SIZE],
    contribution_amount: u64,
    round_duration_secs: i64,
) -> Result<()> {
    require!(contribution_amount > 0, AjoError::InvalidContributionAmount);
    require!(round_duration_secs > 0, AjoError::InvalidRoundDuration);

    for i in 0..GROUP_SIZE {
        require!(members[i] != Pubkey::default(), AjoError::InvalidMembers);
        for j in (i + 1)..GROUP_SIZE {
            require!(members[i] != members[j], AjoError::InvalidMembers);
        }
    }

    let now = Clock::get()?.unix_timestamp;
    let group = &mut ctx.accounts.group;
    group.creator = ctx.accounts.creator.key();
    group.group_id = group_id;
    group.members = members;
    group.contribution_amount = contribution_amount;
    group.round_number = 0;
    group.round_deadline = now
        .checked_add(round_duration_secs)
        .ok_or(AjoError::InvalidRoundDuration)?;
    group.round_duration_secs = round_duration_secs;
    group.has_contributed = [false; GROUP_SIZE];
    group.defaulted = [false; GROUP_SIZE];
    group.completed = false;

    msg!(
        "Ajo group {} created by {}, {} members, {} lamports/round",
        group_id,
        group.creator,
        GROUP_SIZE,
        contribution_amount
    );

    Ok(())
}
