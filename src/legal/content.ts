/**
 * Legal text shown in the app and on the web (/legal/...).
 * Bump LEGAL_VERSION when the Terms or Privacy Policy change materially: users accept the version
 * during onboarding and it is recorded on their profile.
 */
export const LEGAL_VERSION = '2026-11-02.2';
export const LEGAL_UPDATED = '2 November 2026';
export const OPERATOR = 'Nderon Beqiri';
export const CONTACT_EMAIL = 'matchdayenquiries@hotmail.com';

export interface LegalSection {
  heading: string;
  body?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  intro: string[];
  sections: LegalSection[];
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro: [
    `MATCHDAY is run by ${OPERATOR}, an individual based in the United Kingdom ("we", "us"). We are the data controller for the personal data described here. Questions or requests: ${CONTACT_EMAIL}.`,
    'This policy explains what we collect when you use the MATCHDAY app or website, why, who we share it with and the rights you have under UK data protection law (UK GDPR and the Data Protection Act 2018).',
  ],
  sections: [
    {
      heading: 'What we collect',
      bullets: [
        'Account details: email address, password (stored securely by our authentication provider, never readable by us), username, display name, and if you add them, a profile photo, bio and preferred position.',
        'Football activity: groups you join, sessions you are invited to or attend, RSVPs, check-ins, line-ups, scores, goals and assists, Man of the Match votes, player ratings, achievements and the statistics calculated from them.',
        'Social features: friends, friend requests, blocks, comments, reactions and reports you make.',
        'Match videos: links to YouTube videos that hosts add to a session (we store only the YouTube link, not the video).',
        'Payments: amounts, payment status, refunds, late fines and guest fees, and the Stripe identifiers that link a payment to Stripe. Card details are entered on Stripe’s own pages and never reach us. If you receive payouts as a host, Stripe collects your identity and bank details; we only receive whether your account is ready to receive payments.',
        'Device and notifications: a push notification token for each device you use, your notification and privacy settings, and basic technical information such as device type, app version and crash reports.',
        'Security records: logs of important actions (for example payments, removals and corrections) to keep the service fair and secure.',
      ],
    },
    {
      heading: 'What we do not collect',
      bullets: [
        'We do not track your location. Session venues and postcodes are whatever the host types in, and searching “near” a place uses the postcode or area you type.',
        'We do not sell your data or use it for advertising.',
        'The camera is only used to scan invite QR codes, and photo access only to choose a profile photo or group logo.',
      ],
    },
    {
      heading: 'Why we use it (and our legal basis)',
      bullets: [
        'To provide the service you signed up for: accounts, groups, sessions, line-ups, stats, voting and payments (performance of a contract).',
        'To send notifications and emails about your sessions, payments and invites (contract; push notifications only with your device permission, which you can switch off any time).',
        'To keep MATCHDAY safe and fair: preventing abuse, resolving disputes, enforcing group rules and keeping audit records (legitimate interests).',
        'To fix bugs and improve the app using crash reports and usage of features (legitimate interests).',
        'To meet legal obligations, for example around payments and responding to lawful requests (legal obligation).',
      ],
    },
    {
      heading: 'Who can see your information',
      bullets: [
        'Other players see your username, display name, photo and position. Who sees your statistics, achievements and bio depends on your privacy setting; members of a group always see your record within that group.',
        'Hosts and group admins see attendance, payment status and any amounts you owe in their sessions and groups.',
        'Man of the Match votes and player ratings are anonymous: other users, including hosts, only see totals and averages, never who voted for whom.',
        'If you appear in a match video and want it taken down, ask the host or contact us and we will remove the link.',
      ],
    },
    {
      heading: 'Service providers we share data with',
      body: ['We use trusted providers to run MATCHDAY. They only process data on our instructions or under their own privacy terms for the service they provide:'],
      bullets: [
        'Supabase — database, authentication, file storage and server functions.',
        'Stripe — card payments, payouts to hosts and identity checks for hosts (Stripe is also an independent controller for payment data; see stripe.com/privacy).',
        'Expo, Google (Firebase Cloud Messaging) and Apple (Push Notification service) — delivering push notifications.',
        'Resend — sending emails.',
        'YouTube (Google) — match videos are hosted on YouTube; video thumbnails load from YouTube and playing a video opens YouTube, which applies its own privacy policy.',
        'Sentry — crash and error reports so we can fix problems.',
        'postcodes.io — turns the postcodes and place names typed into MATCHDAY (for a session venue or a search) into map coordinates. Only the text typed is sent; we never use your device’s location.',
      ],
    },
    {
      heading: 'International transfers',
      body: ['Some providers may process data outside the UK. Where they do, transfers are protected by appropriate safeguards such as UK adequacy regulations or the UK International Data Transfer Addendum to the EU Standard Contractual Clauses.'],
    },
    {
      heading: 'How long we keep it',
      bullets: [
        'We keep your account data until you delete your account.',
        'When you delete your account, your profile, friends, statistics, votes, ratings and notifications are deleted, groups you own are handed to another member, and your payment records are removed from MATCHDAY. Stripe keeps its own transaction records as required by law.',
        'We may keep a minimal record that an account was deleted, and security logs, for up to 12 months to prevent abuse.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You can ask to access, correct, delete or receive a copy of your data, object to or restrict how we use it, and withdraw consent where we rely on it. You can edit most details yourself in Settings and delete your account at any time in Settings → Delete account.',
        `To make a request, email ${CONTACT_EMAIL}. We will reply within one month. You also have the right to complain to the Information Commissioner’s Office (ico.org.uk).`,
      ],
    },
    {
      heading: 'Children',
      body: ['MATCHDAY is for people aged 16 and over. You must be 18 or over to receive payouts as a host. If you think a child under 16 has an account, contact us and we will delete it.'],
    },
    {
      heading: 'Security',
      body: ['Data is encrypted in transit, access is restricted by strict database rules, and payments are handled entirely by Stripe. No system is perfectly secure, so please use a strong, unique password.'],
    },
    {
      heading: 'Changes',
      body: ['If we change this policy in a meaningful way we will tell you in the app before the change takes effect.'],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  intro: [
    `These terms are an agreement between you and ${OPERATOR} ("we", "us"), who runs MATCHDAY. By creating an account you agree to them. Contact: ${CONTACT_EMAIL}.`,
  ],
  sections: [
    {
      heading: 'What MATCHDAY is',
      body: [
        'MATCHDAY helps groups organise casual football: inviting players, line-ups, results, stats, voting and collecting session fees. Games are organised by hosts, not by us. We are not the organiser, venue or employer of anyone involved and we do not supervise matches.',
      ],
    },
    {
      heading: 'Your account',
      bullets: [
        'You must be 16 or over, and 18 or over to receive payouts as a host.',
        'Give accurate details, keep your password safe and use one account per person.',
        'You are responsible for activity on your account.',
      ],
    },
    {
      heading: 'Playing fair',
      body: ['Do not:'],
      bullets: [
        'harass, threaten or abuse anyone, or post offensive or unlawful content;',
        'submit false scores, goals or attendance, or manipulate votes and ratings;',
        'impersonate others, create fake accounts or misuse invite links;',
        'try to break, overload or get around the security of the service.',
      ],
    },
    {
      heading: 'Hosts and groups',
      bullets: [
        'Hosts and group admins set their own rules, prices, late-fine settings and who can join, and can remove players or guests.',
        'Hosts are responsible for the games they organise, including venue bookings and telling players about any changes.',
        'Hosts who collect fees must set up a Stripe account, agree to the Stripe Connected Account Agreement and are responsible for their own tax.',
        'Hosts can link YouTube videos of a game. Only share videos the people in them are happy to appear in, and remove a video if someone asks. Videos are hosted by YouTube under YouTube’s own terms; MATCHDAY only stores the link.',
      ],
    },
    {
      heading: 'Payments',
      bullets: [
        'Payments are processed by Stripe. Money goes to the host’s Stripe account; we never hold your funds.',
        'Prices are set by the host. A booking fee is added to each payment and shown before you pay; it covers card processing and goes to MATCHDAY. The host receives their full price.',
        'Pay upfront: your card is authorised when you pay and only charged after the host confirms the game took place. If the host does not confirm within 24 hours of the scheduled end, the authorisation is released.',
        'Pay after: you are asked to pay once the host completes the session.',
        'Guests: if you bring guests to a paid session you pay for them, on your bill or as a separate guest fee if you have already paid.',
        'Late fines: some groups fine late arrivals. Fines are shown to you, added to your next payment in that group and can be waived or changed by the host.',
        'Unpaid bills: groups can require you to settle unpaid bills before joining their next game.',
      ],
    },
    {
      heading: 'Refunds and cancellations',
      bullets: [
        'If a session is cancelled, card authorisations are released and completed payments are refunded automatically, including the booking fee.',
        'Otherwise refunds are at the host’s discretion and are made through the app; refunded payments include the booking fee.',
        'If you think you were charged incorrectly, speak to the host first, then contact us. This does not affect your rights with your card provider.',
      ],
    },
    {
      heading: 'Health and safety',
      body: ['Football carries a risk of injury. You take part at your own risk and are responsible for being fit to play. Nothing in these terms limits liability for death or personal injury caused by negligence, or anything else that cannot be limited by law.'],
    },
    {
      heading: 'Your content',
      body: ['You keep ownership of what you post (photos, comments, names). You give us permission to store and display it within MATCHDAY to run the service. We may remove content or suspend accounts that break these terms.'],
    },
    {
      heading: 'The service',
      body: [
        'We work hard to keep MATCHDAY running and accurate, but it is provided as it is and may sometimes be unavailable or contain mistakes. Statistics are based on what hosts and players enter.',
        'To the extent the law allows, we are not liable for indirect losses, or for disputes between players and hosts. Your statutory rights as a consumer are not affected.',
      ],
    },
    {
      heading: 'Ending your account',
      body: ['You can delete your account at any time in Settings. We may suspend or close accounts that seriously or repeatedly break these terms, and will tell you why unless the law prevents it.'],
    },
    {
      heading: 'Changes and law',
      body: [
        'We may update these terms; if a change is significant we will tell you in the app first. If you keep using MATCHDAY after that, the new terms apply.',
        'These terms are governed by the law of England and Wales. If you live elsewhere in the UK you can also bring proceedings in your local courts.',
      ],
    },
  ],
};

export const ACCOUNT_DELETION: LegalDoc = {
  title: 'Delete your account',
  intro: ['You can delete your MATCHDAY account and its data at any time.'],
  sections: [
    {
      heading: 'In the app',
      bullets: ['Open MATCHDAY and go to Settings.', 'Tap Delete account.', 'Type DELETE and confirm. This is immediate and cannot be undone.'],
    },
    {
      heading: 'Without the app',
      body: [`Email ${CONTACT_EMAIL} from the email address on your account with the subject "Delete my account". We will delete it within 30 days and confirm by email.`],
    },
    {
      heading: 'What is deleted',
      bullets: [
        'Your profile, photo, friends, statistics, votes, ratings, notifications and payment records in MATCHDAY.',
        'Groups you own are handed to another member (or deleted if you are the only member).',
        'Stripe keeps its own transaction records as required by law. A minimal record of the deletion and security logs may be kept for up to 12 months.',
        'Payments still in progress must finish before the account can be deleted.',
      ],
    },
  ],
};
