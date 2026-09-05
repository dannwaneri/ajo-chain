use {
    ajo_chain::state::Group,
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const GROUP_ID: u64 = 1;
const CONTRIBUTION_AMOUNT: u64 = 100_000_000; // 0.1 SOL
const ROUND_DURATION_SECS: i64 = 60;
const STARTING_BALANCE: u64 = 5_000_000_000; // 5 SOL

struct Harness {
    svm: LiteSVM,
    program_id: Pubkey,
    creator: Keypair,
    members: Vec<Keypair>,
    group: Pubkey,
    escrow: Pubkey,
}

fn setup() -> Harness {
    let program_id = ajo_chain::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/ajo_chain.so"
    ));
    svm.add_program(program_id, bytes).unwrap();

    let creator = Keypair::new();
    svm.airdrop(&creator.pubkey(), STARTING_BALANCE).unwrap();

    let mut members = Vec::with_capacity(5);
    for _ in 0..5 {
        let kp = Keypair::new();
        svm.airdrop(&kp.pubkey(), STARTING_BALANCE).unwrap();
        members.push(kp);
    }

    let group = Pubkey::find_program_address(
        &[
            ajo_chain::constants::GROUP_SEED,
            creator.pubkey().as_ref(),
            &GROUP_ID.to_le_bytes(),
        ],
        &program_id,
    )
    .0;
    let escrow = Pubkey::find_program_address(
        &[ajo_chain::constants::ESCROW_SEED, group.as_ref()],
        &program_id,
    )
    .0;

    let member_keys: [Pubkey; 5] = members
        .iter()
        .map(|k| k.pubkey())
        .collect::<Vec<_>>()
        .try_into()
        .unwrap();

    let ix = Instruction::new_with_bytes(
        program_id,
        &ajo_chain::instruction::CreateGroup {
            group_id: GROUP_ID,
            members: member_keys,
            contribution_amount: CONTRIBUTION_AMOUNT,
            round_duration_secs: ROUND_DURATION_SECS,
        }
        .data(),
        ajo_chain::accounts::CreateGroup {
            creator: creator.pubkey(),
            group,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[ix], &creator, &[&creator]);

    Harness {
        svm,
        program_id,
        creator,
        members,
        group,
        escrow,
    }
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) {
    // Force a fresh blockhash so structurally-identical transactions (e.g. the
    // same member contributing in a later round) never collide on signature.
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "transaction failed: {:?}", res.err());
}

fn send_expect_err(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err(), "expected transaction to fail but it succeeded");
}

fn contribute_ix(h: &Harness, member: &Keypair) -> Instruction {
    Instruction::new_with_bytes(
        h.program_id,
        &ajo_chain::instruction::Contribute {}.data(),
        ajo_chain::accounts::Contribute {
            member: member.pubkey(),
            group: h.group,
            escrow: h.escrow,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn release_payout_ix(h: &Harness, caller: &Keypair, recipient: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        h.program_id,
        &ajo_chain::instruction::ReleasePayout {}.data(),
        ajo_chain::accounts::ReleasePayout {
            caller: caller.pubkey(),
            group: h.group,
            escrow: h.escrow,
            recipient,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn mark_default_ix(h: &Harness, caller: &Keypair) -> Instruction {
    Instruction::new_with_bytes(
        h.program_id,
        &ajo_chain::instruction::MarkDefault {}.data(),
        ajo_chain::accounts::MarkDefault {
            caller: caller.pubkey(),
            group: h.group,
        }
        .to_account_metas(None),
    )
}

fn load_group(h: &Harness) -> Group {
    let acc = h.svm.get_account(&h.group).unwrap();
    let mut data: &[u8] = &acc.data;
    Group::try_deserialize(&mut data).unwrap()
}

/// Full happy-path round: all 5 members contribute, anyone can crank
/// release_payout, and it pays exactly the member next in rotation order.
#[test]
fn full_round_cycle_pays_correct_rotation_member() {
    let mut h = setup();

    let group_state = load_group(&h);
    assert_eq!(group_state.round_number, 0);
    assert!(!group_state.completed);
    assert_eq!(group_state.creator, h.creator.pubkey());

    for member in &h.members {
        let ix = contribute_ix(&h, member);
        send(&mut h.svm, &[ix], member, &[member]);
    }

    let recipient = h.members[0].pubkey();
    let recipient_balance_before = h.svm.get_balance(&recipient).unwrap();

    let caller = Keypair::new();
    h.svm.airdrop(&caller.pubkey(), STARTING_BALANCE).unwrap();
    let ix = release_payout_ix(&h, &caller, recipient);
    send(&mut h.svm, &[ix], &caller, &[&caller]);

    let recipient_balance_after = h.svm.get_balance(&recipient).unwrap();
    assert_eq!(
        recipient_balance_after - recipient_balance_before,
        CONTRIBUTION_AMOUNT * 5,
        "payout should equal 5x the fixed contribution amount"
    );

    let group_state = load_group(&h);
    assert_eq!(group_state.round_number, 1, "round should advance to 1");
    assert!(group_state.has_contributed.iter().all(|&c| !c), "contribution flags reset for next round");
    assert!(!group_state.completed);

    // Wrong recipient (not next in rotation) must be rejected.
    for member in &h.members {
        let ix = contribute_ix(&h, member);
        send(&mut h.svm, &[ix], member, &[member]);
    }
    let wrong_recipient = h.members[2].pubkey();
    let ix = release_payout_ix(&h, &caller, wrong_recipient);
    send_expect_err(&mut h.svm, &[ix], &caller, &[&caller]);
}

/// One deliberate default: 4 of 5 members contribute, the round deadline
/// passes, mark_default permanently flags the missing member on-chain, and
/// release_payout correctly refuses to pay out since not everyone contributed.
#[test]
fn deliberate_default_is_flagged_and_blocks_payout() {
    let mut h = setup();

    // Members 0-3 contribute; member 4 deliberately does not.
    for member in &h.members[0..4] {
        let ix = contribute_ix(&h, member);
        send(&mut h.svm, &[ix], member, &[member]);
    }

    // release_payout must fail before the deadline since not everyone paid.
    let caller = Keypair::new();
    h.svm.airdrop(&caller.pubkey(), STARTING_BALANCE).unwrap();
    let recipient = h.members[0].pubkey();
    let ix = release_payout_ix(&h, &caller, recipient);
    send_expect_err(&mut h.svm, &[ix], &caller, &[&caller]);

    // mark_default before the deadline must fail too.
    let ix = mark_default_ix(&h, &caller);
    send_expect_err(&mut h.svm, &[ix], &caller, &[&caller]);

    // Advance the clock past the round deadline.
    let mut clock = h.svm.get_sysvar::<Clock>();
    clock.unix_timestamp += ROUND_DURATION_SECS + 1;
    h.svm.set_sysvar(&clock);

    // Anyone can crank mark_default once the deadline has passed.
    let ix = mark_default_ix(&h, &caller);
    send(&mut h.svm, &[ix], &caller, &[&caller]);

    let group_state = load_group(&h);
    assert!(!group_state.defaulted[0..4].iter().any(|&d| d), "on-time members must not be flagged");
    assert!(group_state.defaulted[4], "member 4 must be permanently flagged as defaulted");

    // The circle remains strict: payout still cannot release until everyone,
    // including the defaulted member, has contributed for this round.
    let ix = release_payout_ix(&h, &caller, recipient);
    send_expect_err(&mut h.svm, &[ix], &caller, &[&caller]);

    // The defaulted member can still contribute late — the default flag is a
    // permanent public record, it is not a ban.
    let ix = contribute_ix(&h, &h.members[4]);
    send(&mut h.svm, &[ix], &h.members[4], &[&h.members[4]]);

    let ix = release_payout_ix(&h, &caller, recipient);
    send(&mut h.svm, &[ix], &caller, &[&caller]);

    let group_state = load_group(&h);
    assert_eq!(group_state.round_number, 1);
    assert!(group_state.defaulted[4], "default record remains visible after the round completes");
}

/// Non-members cannot contribute, and a member cannot double-contribute in
/// the same round.
#[test]
fn rejects_non_members_and_double_contribution() {
    let mut h = setup();

    let outsider = Keypair::new();
    h.svm.airdrop(&outsider.pubkey(), STARTING_BALANCE).unwrap();
    let ix = contribute_ix(&h, &outsider);
    send_expect_err(&mut h.svm, &[ix], &outsider, &[&outsider]);

    let member = &h.members[0];
    let ix = contribute_ix(&h, member);
    send(&mut h.svm, &[ix], member, &[member]);

    let ix = contribute_ix(&h, member);
    send_expect_err(&mut h.svm, &[ix], member, &[member]);
}
