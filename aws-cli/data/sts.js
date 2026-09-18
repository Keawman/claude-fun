/* Topic: STS & Identity */
AWSCHEAT.register({
  id: 'sts',
  title: 'STS & Identity',
  order: 3,
  intro: 'Who am I, and how do I become someone else. Every troubleshooting session should start with `get-caller-identity`; every cross-account workflow ends up in `assume-role`.',
  subtopics: [
    { id: 'identity', title: 'Caller identity' },
    { id: 'assume', title: 'Assume role' },
    { id: 'session-token', title: 'Session tokens & MFA' },
    { id: 'decode', title: 'Decode & inspect' }
  ],
  cards: [
    {
      id: 'get-caller-identity',
      subtopic: 'identity',
      title: 'Show the identity the CLI is using',
      command: `aws sts get-caller-identity`,
      description: 'Returns the account, ARN and unique ID of the credentials in effect. Requires no IAM permission and works even for identities with zero policies, which makes it the universal "are my credentials valid" probe.',
      flags: [
        ['--profile <profile>', '(optional) Check a specific profile without changing your shell.'],
        ['--query Account --output text', '(optional) Just the account ID, for scripts.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEID:alice",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice"
}` },
      note: { type: 'info', text: 'For an assumed role the ARN is `arn:aws:sts::…:assumed-role/<role>/<session>`, not the IAM role ARN. IAM users show `arn:aws:iam::…:user/<name>`. In GovCloud the partition is `aws-us-gov`.' },
      iam: [],
      related: ['sts-get-caller-identity-table', 'setup-configure-list', 'govcloud-caller-identity'],
      tags: ['read-only']
    },
    {
      id: 'get-caller-identity-table',
      subtopic: 'identity',
      title: 'Caller identity as a table (quick visual check)',
      command: `aws sts get-caller-identity --output table`,
      description: 'The same call, formatted for humans. Useful as the first line of a runbook so the operator sees which account they are about to touch.',
      flags: [
        ['--output table', 'Scalars of a top-level object are rendered as a single-row table.']
      ],
      output: { format: 'table', body: `-----------------------------------------------------------------------------------------------------------
|                                            GetCallerIdentity                                            |
+----------------+----------------------------------------------------------------+-----------------------+
|    Account     |                              Arn                               |         UserId        |
+----------------+----------------------------------------------------------------+-----------------------+
|  123456789012  |  arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice  |  AROAEXAMPLEID:alice  |
+----------------+----------------------------------------------------------------+-----------------------+` },
      iam: [],
      related: ['sts-get-caller-identity'],
      tags: ['read-only']
    },
    {
      id: 'assume-role',
      subtopic: 'assume',
      title: 'Assume a role and get temporary credentials',
      command: `aws sts assume-role \\
  --role-arn arn:aws:iam::123456789012:role/<role-name> \\
  --role-session-name <session-name> \\
  --duration-seconds 3600`,
      description: 'Exchanges your current credentials for a temporary key, secret and session token bound to the target role. The role\'s trust policy must allow your principal, and your own policy must allow `sts:AssumeRole` on the role.',
      flags: [
        ['--role-session-name', 'Free text that appears in CloudTrail as the session identifier. Use something traceable (`alice-incident-4521`).'],
        ['--duration-seconds', '900 up to the role\'s configured max (default max 1 h). Role chaining is capped at 1 h regardless.'],
        ['--external-id <external-id>', '(optional) Required by roles that use the confused-deputy guard in their trust policy.'],
        ['--serial-number / --token-code', '(optional) Supply MFA when the trust policy has `aws:MultiFactorAuthPresent`.']
      ],
      output: { format: 'json', body: `{
    "Credentials": {
        "AccessKeyId": "ASIAIOSFODNN7EXAMPLE",
        "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "SessionToken": "IQoJb3JpZ2luX2VjEJr//////////wEaCXVzLWVhc3QtMSJHMEUCIQDExampleSessionTokenTruncated==",
        "Expiration": "2026-09-18T15:30:12+00:00"
    },
    "AssumedRoleUser": {
        "AssumedRoleId": "AROAEXAMPLEID:alice-incident-4521",
        "Arn": "arn:aws:sts::123456789012:assumed-role/Admin/alice-incident-4521"
    }
}` },
      note: { type: 'gotcha', text: '`AccessDenied … is not authorized to perform: sts:AssumeRole` can come from either side: your identity policy or the role\'s trust policy. `DurationSeconds exceeds the MaxSessionDuration` means the role\'s max is shorter than you asked for.' },
      iam: ['sts:AssumeRole'],
      related: ['sts-assume-role-export', 'sts-assume-role-profile', 'iam-get-role-trust'],
      tags: ['read-only', 'security']
    },
    {
      id: 'assume-role-export',
      subtopic: 'assume',
      title: 'Assume a role and export the credentials into your shell',
      command: `read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN <<<"$(aws sts assume-role \\
  --role-arn arn:aws:iam::123456789012:role/<role-name> \\
  --role-session-name <session-name> \\
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \\
  --output text)"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws sts get-caller-identity --query Arn --output text`,
      description: 'Text output of a three-element list is one tab-separated line, which `read` splits straight into the three variables. After the export, every tool that honours the standard environment variables (CLI, SDKs, Terraform) uses the role.',
      flags: [
        ['--query \'Credentials.[…]\' --output text', 'Emit the three secrets in a fixed order with no quoting.'],
        ['read -r a b c <<<"…"', 'Bash here-string; whitespace splitting assigns the fields.'],
        ['unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN', 'How to get back to your profile-based identity afterwards.']
      ],
      output: { format: 'text', body: `arn:aws:sts::123456789012:assumed-role/Admin/alice-incident-4521` },
      note: { type: 'gotcha', text: 'While these variables are set, `--profile` no longer changes credentials. Prefer `aws configure export-credentials` or a `role_arn` profile for anything you do more than once.' },
      iam: ['sts:AssumeRole'],
      related: ['sts-assume-role', 'sts-export-credentials', 'setup-env-vars'],
      tags: ['read-only', 'scripting', 'security']
    },
    {
      id: 'assume-role-profile',
      subtopic: 'assume',
      title: 'Let the CLI assume the role for you via a profile',
      command: `aws configure set role_arn arn:aws:iam::123456789012:role/<role-name> --profile <profile>
aws configure set source_profile <source-profile> --profile <profile>
aws configure set role_session_name <session-name> --profile <profile>
aws sts get-caller-identity --profile <profile>`,
      description: 'A profile with `role_arn` and `source_profile` makes the CLI call assume-role transparently and cache the result in `~/.aws/cli/cache`. Add `mfa_serial` to be prompted for a code, or `external_id` for third-party roles.',
      flags: [
        ['role_arn', 'Role to assume.'],
        ['source_profile', 'Profile whose credentials perform the assume-role call. Use `credential_source = Ec2InstanceMetadata|Environment|EcsContainer` instead when running on AWS compute.'],
        ['mfa_serial', 'MFA device ARN; the CLI prompts for the code on first use and caches the session.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEID:botocore-session-1758207012",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/Admin/botocore-session-1758207012"
}` },
      iam: ['sts:AssumeRole'],
      related: ['setup-config-files', 'sts-export-credentials'],
      tags: ['mutating', 'config']
    },
    {
      id: 'export-credentials',
      subtopic: 'assume',
      title: 'Export any profile\'s resolved credentials (SSO, role, process)',
      command: `eval "$(aws configure export-credentials --profile <profile> --format env)"
aws sts get-caller-identity`,
      description: 'Resolves the profile through whatever chain it uses (SSO token, role assumption, credential_process) and prints the resulting temporary credentials. This is the supported way to hand SSO credentials to tools that only understand environment variables.',
      flags: [
        ['--format env', 'Bash `export` lines. Also `env-no-export`, `powershell`, `windows-cmd`, and `process` (JSON for `credential_process`).'],
        ['--profile', 'The profile to resolve. Requires v2.9 or newer.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEID:alice",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice"
}` },
      note: { type: 'info', text: 'The exported credentials expire with the underlying session (typically 1–12 h). Re-run the `eval` line to refresh.' },
      iam: [],
      related: ['sts-assume-role-export', 'setup-sso-login'],
      tags: ['read-only', 'scripting', 'security']
    },
    {
      id: 'get-session-token-mfa',
      subtopic: 'session-token',
      title: 'Get an MFA-authenticated session for an IAM user',
      command: `aws sts get-session-token \\
  --serial-number arn:aws:iam::123456789012:mfa/<user-name> \\
  --token-code <mfa-code> \\
  --duration-seconds 43200`,
      description: 'For IAM users whose policies require MFA (`aws:MultiFactorAuthPresent`), this trades the long-lived key plus a TOTP code for temporary credentials that carry the MFA flag. Export them like assume-role output.',
      flags: [
        ['--serial-number', 'The MFA device ARN, from `aws iam list-mfa-devices --user-name <user-name>`.'],
        ['--token-code', 'The six-digit code from the device, valid for 30 s.'],
        ['--duration-seconds', '900 to 129600 (36 h) for IAM users; root is capped at 3600.']
      ],
      output: { format: 'json', body: `{
    "Credentials": {
        "AccessKeyId": "ASIAIOSFODNN7EXAMPLE",
        "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "SessionToken": "FwoGZXIvYXdzEBYaDExampleSessionTokenTruncated==",
        "Expiration": "2026-09-19T02:30:12+00:00"
    }
}` },
      note: { type: 'gotcha', text: 'You must call this with the user\'s long-lived keys, not with temporary credentials. The resulting session cannot call IAM APIs that require MFA on root, and cannot itself call get-session-token again.' },
      iam: [],
      related: ['sts-assume-role-export', 'iam-list-mfa-devices'],
      tags: ['read-only', 'security']
    },
    {
      id: 'decode-authorization-message',
      subtopic: 'decode',
      title: 'Decode an "encoded authorization failure message"',
      command: `aws sts decode-authorization-message \\
  --encoded-message <encoded-message> \\
  --query DecodedMessage --output text | jq .`,
      description: 'EC2 and some other services hide the details of an `UnauthorizedOperation` error inside an encoded blob. Decoding it reveals which principal, action, resource and condition keys were evaluated and which policy statement denied.',
      flags: [
        ['--encoded-message', 'The long base64-looking string after `Encoded authorization failure message:` in the error.'],
        ['--query DecodedMessage --output text | jq .', 'The decoded payload is a JSON string; this pretty-prints it.']
      ],
      output: { format: 'json', body: `{
  "allowed": false,
  "explicitDeny": false,
  "matchedStatements": {
    "items": []
  },
  "failures": {
    "items": []
  },
  "context": {
    "principal": {
      "id": "AROAEXAMPLEID:alice",
      "arn": "arn:aws:sts::123456789012:assumed-role/ReadOnly/alice"
    },
    "action": "ec2:TerminateInstances",
    "resource": "arn:aws:ec2:us-east-1:123456789012:instance/i-0abc123def4567890",
    "conditions": {
      "items": [
        {
          "key": "ec2:ResourceTag/Environment",
          "values": {
            "items": [
              {
                "value": "prod"
              }
            ]
          }
        }
      ]
    }
  }
}` },
      note: { type: 'info', text: 'Decoding requires `sts:DecodeAuthorizationMessage`, which the denied identity often lacks; run it from an admin profile. `explicitDeny: false` with `allowed: false` means an implicit deny: no statement matched at all.' },
      iam: ['sts:DecodeAuthorizationMessage'],
      related: ['iam-simulate-principal-policy', 'scripting-exit-codes'],
      tags: ['read-only', 'security']
    },
    {
      id: 'get-access-key-info',
      subtopic: 'decode',
      title: 'Find which account an access key belongs to',
      command: `aws sts get-access-key-info --access-key-id <access-key-id>`,
      description: 'Given only an access key ID (found in a log, a leaked file, a config on a random host) this returns the owning account. Works for `AKIA` and `ASIA` keys from any account, without needing the secret.',
      flags: [
        ['--access-key-id', 'The 20-character key ID. Any account\'s key, not just yours.']
      ],
      output: { format: 'json', body: `{
    "Account": "123456789012"
}` },
      iam: ['sts:GetAccessKeyInfo'],
      related: ['iam-access-key-last-used', 'iam-rotate-access-key'],
      tags: ['read-only', 'security']
    }
  ]
});
