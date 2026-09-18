/* Topic: IAM */
AWSCHEAT.register({
  id: 'iam',
  title: 'IAM',
  order: 4,
  intro: 'IAM is global (no `--region`), eventually consistent (a new policy can take seconds to apply) and unforgiving about naming: user names, role names and policy ARNs are exact. Almost everything here is safe to read; the writes are where tags like `mutating` earn their keep.',
  subtopics: [
    { id: 'users', title: 'Users & groups' },
    { id: 'roles', title: 'Roles' },
    { id: 'policies', title: 'Policies' },
    { id: 'simulate', title: 'Policy simulation' },
    { id: 'access-keys', title: 'Access keys' },
    { id: 'reports', title: 'Reports & account' },
    { id: 'instance-profiles', title: 'Instance profiles' }
  ],
  cards: [
    {
      id: 'list-users',
      subtopic: 'users',
      title: 'List users with creation date and last console login',
      command: `aws iam list-users \\
  --query 'Users[].[UserName,CreateDate,PasswordLastUsed]' \\
  --output table`,
      description: 'A quick census of human and service users. `PasswordLastUsed` is absent (`None`) for users with no console password, which is a useful signal that a user is API-only.',
      flags: [
        ['--query', 'Three columns; add `Arn` or `UserId` if you need them.'],
        ['--path-prefix /service/', '(optional) Only users created under an IAM path.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------
|                                ListUsers                                 |
+--------------+-----------------------------+-----------------------------+
|  alice       |  2024-02-11T09:12:44+00:00  |  2026-09-17T08:03:19+00:00  |
|  svc-backup  |  2024-06-30T15:44:01+00:00  |  None                       |
|  svc-ci      |  2025-01-15T11:20:37+00:00  |  None                       |
+--------------+-----------------------------+-----------------------------+` },
      iam: ['iam:ListUsers'],
      related: ['iam-get-user-permissions', 'iam-credential-report'],
      tags: ['read-only', 'query']
    },
    {
      id: 'get-user-permissions',
      subtopic: 'users',
      title: 'See everything attached to a user (policies, inline, groups)',
      command: `aws iam list-attached-user-policies --user-name <user-name> --query 'AttachedPolicies[].PolicyArn' --output text
aws iam list-user-policies --user-name <user-name> --query PolicyNames --output text
aws iam list-groups-for-user --user-name <user-name> --query 'Groups[].GroupName' --output text`,
      description: 'Permissions can come from three places: managed policies attached directly, inline policies embedded in the user, and groups (which have their own attached and inline policies). You need all three calls to know what a user can do.',
      flags: [
        ['list-attached-user-policies', 'Managed (AWS or customer) policies by ARN.'],
        ['list-user-policies', 'Names of inline policies; fetch each with `get-user-policy`.'],
        ['list-groups-for-user', 'Then repeat the first two calls with `list-attached-group-policies` / `list-group-policies`.']
      ],
      output: { format: 'text', body: `arn:aws:iam::aws:policy/ReadOnlyAccess	arn:aws:iam::123456789012:policy/BackupOperator
s3-restore-inline
Developers	OnCall` },
      iam: ['iam:ListAttachedUserPolicies', 'iam:ListUserPolicies', 'iam:ListGroupsForUser'],
      related: ['iam-get-policy-document', 'iam-simulate-principal-policy'],
      tags: ['read-only', 'security']
    },
    {
      id: 'list-roles-by-trust',
      subtopic: 'roles',
      title: 'List roles trusted by a service or account',
      command: `aws iam list-roles \\
  --query 'Roles[?contains(to_string(AssumeRolePolicyDocument.Statement[].Principal), \`ec2.amazonaws.com\`)].[RoleName,Arn]' \\
  --output text`,
      description: 'Trust policies are returned inline with every role, so a client-side filter finds roles assumable by EC2, Lambda, another account ID or an SSO provider without opening each one.',
      flags: [
        ['to_string(…)', 'Serialises the Principal object so `contains` can substring-match it regardless of whether it is a string or list.'],
        ['`123456789012`', 'Search for an account ID here to find cross-account roles.']
      ],
      output: { format: 'text', body: `web-instance-role	arn:aws:iam::123456789012:role/web-instance-role
ssm-managed-instance	arn:aws:iam::123456789012:role/ssm-managed-instance` },
      iam: ['iam:ListRoles'],
      related: ['iam-get-role-trust', 'iam-create-role'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'get-role-trust',
      subtopic: 'roles',
      title: 'Show a role\'s trust policy and session limit',
      command: `aws iam get-role --role-name <role-name> \\
  --query 'Role.{Arn:Arn,MaxSession:MaxSessionDuration,Trust:AssumeRolePolicyDocument}'`,
      description: 'The trust policy answers "who can assume this" and `MaxSessionDuration` explains `assume-role` failures about duration. Update the trust with `update-assume-role-policy --policy-document file://trust.json`.',
      flags: [
        ['--query Role.AssumeRolePolicyDocument', 'The document comes back URL-decoded JSON, unlike `get-policy-version`.']
      ],
      output: { format: 'json', body: `{
    "Arn": "arn:aws:iam::123456789012:role/Admin",
    "MaxSession": 3600,
    "Trust": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "AWS": "arn:aws:iam::123456789012:role/PowerUserAccess"
                },
                "Action": "sts:AssumeRole",
                "Condition": {
                    "Bool": {
                        "aws:MultiFactorAuthPresent": "true"
                    }
                }
            }
        ]
    }
}` },
      iam: ['iam:GetRole'],
      related: ['sts-assume-role', 'iam-list-roles-by-trust'],
      tags: ['read-only', 'security']
    },
    {
      id: 'create-role',
      subtopic: 'roles',
      title: 'Create a role from a trust policy file and attach a managed policy',
      command: `aws iam create-role \\
  --role-name <role-name> \\
  --assume-role-policy-document file://trust.json \\
  --max-session-duration 7200 \\
  --tags Key=Owner,Value=platform
aws iam attach-role-policy \\
  --role-name <role-name> \\
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`,
      description: 'Two steps: create the role with its trust policy (who may assume it), then attach permissions. `file://` reads the JSON document from disk so you never fight shell quoting.',
      flags: [
        ['--assume-role-policy-document file://…', 'Trust policy JSON. The file must be a policy document, not wrapped in any other object.'],
        ['--max-session-duration', '3600–43200 seconds; controls the ceiling for `assume-role --duration-seconds`.'],
        ['attach-role-policy --policy-arn', 'AWS-managed ARNs live under `arn:aws:iam::aws:policy/`; yours under your account ID.']
      ],
      output: { format: 'json', body: `{
    "Role": {
        "Path": "/",
        "RoleName": "ssm-managed-instance",
        "RoleId": "AROAEXAMPLEROLEID12",
        "Arn": "arn:aws:iam::123456789012:role/ssm-managed-instance",
        "CreateDate": "2026-09-18T14:40:02+00:00",
        "AssumeRolePolicyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "ec2.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        },
        "MaxSessionDuration": 7200,
        "Tags": [
            {
                "Key": "Owner",
                "Value": "platform"
            }
        ]
    }
}` },
      note: { type: 'info', text: 'For EC2 the role also needs an instance profile (see the Instance profiles cards). In GovCloud the managed policy ARN partition changes to `arn:aws-us-gov:iam::aws:policy/…`.' },
      iam: ['iam:CreateRole', 'iam:TagRole', 'iam:AttachRolePolicy'],
      related: ['iam-create-instance-profile', 'iam-detach-policy', 'govcloud-arns'],
      tags: ['mutating', 'security']
    },
    {
      id: 'role-policies',
      subtopic: 'roles',
      title: 'List a role\'s attached and inline policies',
      command: `aws iam list-attached-role-policies --role-name <role-name> --output table
aws iam list-role-policies --role-name <role-name>`,
      description: 'Attached managed policies are listed with ARNs; inline policies are listed by name only, and their documents are fetched with `get-role-policy --role-name … --policy-name …`.',
      flags: [
        ['list-attached-role-policies', 'Managed policies (max 10 per role by default quota).'],
        ['list-role-policies', 'Inline policy names embedded in the role.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------------
|                                  ListAttachedRolePolicies                                  |
+--------------------------------------------------------------------------------------------+
||                                     AttachedPolicies                                     ||
|+-----------------------------------------------------------------+------------------------+|
||                            PolicyArn                            |       PolicyName       ||
|+-----------------------------------------------------------------+------------------------+|
||  arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore           |  AmazonSSMManagedInstanceCore  ||
||  arn:aws:iam::123456789012:policy/app-secrets-read              |  app-secrets-read      ||
|+-----------------------------------------------------------------+------------------------+|
{
    "PolicyNames": [
        "s3-artifacts-inline"
    ]
}` },
      note: { type: 'info', text: 'Without `--query`, table output nests the `AttachedPolicies` key as a sub-table with double bars. Add `--query AttachedPolicies` for a flat grid.' },
      iam: ['iam:ListAttachedRolePolicies', 'iam:ListRolePolicies'],
      related: ['iam-get-policy-document', 'iam-detach-policy'],
      tags: ['read-only']
    },
    {
      id: 'get-policy-document',
      subtopic: 'policies',
      title: 'Read the current document of a managed policy',
      command: `aws iam get-policy-version \\
  --policy-arn <policy-arn> \\
  --version-id "$(aws iam get-policy --policy-arn <policy-arn> --query Policy.DefaultVersionId --output text)" \\
  --query PolicyVersion.Document`,
      description: 'Managed policies are versioned (up to five); the document lives on a version, not the policy. The inner call fetches the default version ID so you always read what is actually in effect.',
      flags: [
        ['get-policy --query Policy.DefaultVersionId', 'Returns e.g. `v3`.'],
        ['get-policy-version --query PolicyVersion.Document', 'The JSON document, already URL-decoded by the CLI.']
      ],
      output: { format: 'json', body: `{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ReadAppSecrets",
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/app/*"
        }
    ]
}` },
      note: { type: 'info', text: 'To publish a new version: `create-policy-version --policy-arn … --policy-document file://p.json --set-as-default`. Delete old versions with `delete-policy-version` when you hit the five-version limit.' },
      iam: ['iam:GetPolicy', 'iam:GetPolicyVersion'],
      related: ['iam-list-entities-for-policy', 'iam-role-policies'],
      tags: ['read-only', 'security']
    },
    {
      id: 'list-entities-for-policy',
      subtopic: 'policies',
      title: 'Who uses this policy? Users, groups and roles it is attached to',
      command: `aws iam list-entities-for-policy --policy-arn <policy-arn> \\
  --query '{Users:PolicyUsers[].UserName,Groups:PolicyGroups[].GroupName,Roles:PolicyRoles[].RoleName}'`,
      description: 'Run this before editing or deleting a managed policy to see the blast radius. A policy cannot be deleted while attached to anything.',
      flags: [
        ['--entity-filter Role', '(optional) Restrict to one entity type: `User`, `Role`, `Group`, `LocalManagedPolicy`, `AWSManagedPolicy`.']
      ],
      output: { format: 'json', body: `{
    "Users": [
        "svc-ci"
    ],
    "Groups": [],
    "Roles": [
        "web-instance-role",
        "worker-instance-role"
    ]
}` },
      iam: ['iam:ListEntitiesForPolicy'],
      related: ['iam-get-policy-document', 'iam-detach-policy'],
      tags: ['read-only', 'security']
    },
    {
      id: 'detach-policy',
      subtopic: 'policies',
      title: 'Attach or detach a managed policy from a user, group or role',
      command: `aws iam attach-user-policy --user-name <user-name> --policy-arn <policy-arn>
aws iam detach-role-policy --role-name <role-name> --policy-arn <policy-arn>
aws iam detach-group-policy --group-name <group-name> --policy-arn <policy-arn>`,
      description: 'The attach/detach family is symmetrical across the three principal types. Detaching takes effect within seconds; running sessions keep working until their next API call.',
      flags: [
        ['attach-*-policy / detach-*-policy', 'One policy ARN per call. There is no bulk form; loop for several.'],
        ['delete-*-policy', 'The equivalent for inline policies, by name rather than ARN.']
      ],
      output: { format: 'none', body: '' },
      iam: ['iam:AttachUserPolicy', 'iam:DetachRolePolicy', 'iam:DetachGroupPolicy'],
      related: ['iam-list-entities-for-policy', 'iam-create-role'],
      tags: ['mutating', 'security']
    },
    {
      id: 'simulate-principal-policy',
      subtopic: 'simulate',
      title: 'Test whether a principal is allowed specific actions',
      command: `aws iam simulate-principal-policy \\
  --policy-source-arn arn:aws:iam::123456789012:role/<role-name> \\
  --action-names s3:GetObject s3:PutObject s3:DeleteObject \\
  --resource-arns arn:aws:s3:::example-bucket/reports/q3.csv \\
  --query 'EvaluationResults[].[EvalActionName,EvalDecision,MatchedStatements[0].SourcePolicyId]' \\
  --output table`,
      description: 'Evaluates the principal\'s identity policies (plus permission boundaries and SCPs where applicable) against the actions and resources you list, without making the real calls. Far faster than trial and error against production.',
      flags: [
        ['--policy-source-arn', 'User, group or role whose policies are simulated.'],
        ['--action-names', 'Space-separated actions in `service:Action` form.'],
        ['--resource-arns', 'Resources to test against. Omit for `*`.'],
        ['--context-entries', '(optional) Supply condition keys: `ContextKeyName=aws:MultiFactorAuthPresent,ContextKeyValues=true,ContextKeyType=boolean`.']
      ],
      output: { format: 'table', body: `--------------------------------------------------------------------
|                     SimulatePrincipalPolicy                      |
+-------------------+----------------+-----------------------------+
|  s3:GetObject     |  allowed       |  ReadReports                |
|  s3:PutObject     |  implicitDeny  |  None                       |
|  s3:DeleteObject  |  explicitDeny  |  DenyDeleteOutsidePipeline  |
+-------------------+----------------+-----------------------------+` },
      note: { type: 'gotcha', text: 'Resource-based policies (bucket policies, KMS key policies) are not evaluated unless you pass `--resource-policy`. An `allowed` here can still be denied by a bucket policy.' },
      iam: ['iam:SimulatePrincipalPolicy', 'iam:GetContextKeysForPrincipalPolicy'],
      related: ['sts-decode-authorization-message', 'iam-get-user-permissions'],
      tags: ['read-only', 'security', 'query']
    },
    {
      id: 'rotate-access-key',
      subtopic: 'access-keys',
      title: 'Rotate an access key safely (create, switch, disable, delete)',
      command: `aws iam create-access-key --user-name <user-name> --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text
# ... update the consumer with the new key, verify it works ...
aws iam update-access-key --user-name <user-name> --access-key-id <old-access-key-id> --status Inactive
# ... wait, confirm nothing broke ...
aws iam delete-access-key --user-name <user-name> --access-key-id <old-access-key-id>`,
      description: 'Each user may have two keys, which is what makes zero-downtime rotation possible. Deactivating before deleting gives you a reversible step: `--status Active` brings the old key back if something still depended on it.',
      flags: [
        ['create-access-key', 'The secret is shown once; capture it now.'],
        ['update-access-key --status Inactive', 'Reversible kill switch.'],
        ['delete-access-key', 'Permanent. Required before the user can be deleted.']
      ],
      output: { format: 'text', body: `AKIAIOSFODNN7EXAMPLE	wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` },
      note: { type: 'danger', text: '`LimitExceeded: Cannot exceed quota for AccessKeysPerUser: 2` means an old key is still around; check `list-access-keys` and `get-access-key-last-used` before deleting the wrong one.' },
      iam: ['iam:CreateAccessKey', 'iam:UpdateAccessKey', 'iam:DeleteAccessKey'],
      related: ['iam-access-key-last-used', 'sts-get-access-key-info'],
      tags: ['destructive', 'security']
    },
    {
      id: 'access-key-last-used',
      subtopic: 'access-keys',
      title: 'Find stale access keys and when they were last used',
      command: `for k in $(aws iam list-access-keys --user-name <user-name> --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
  aws iam get-access-key-last-used --access-key-id "$k" \\
    --query '[AccessKeyLastUsed.LastUsedDate,AccessKeyLastUsed.ServiceName,AccessKeyLastUsed.Region]' --output text | sed "s/^/$k\\t/"
done`,
      description: 'Combines the list of keys with the per-key last-used record. A key with `None` was never used; a key last used months ago by one service is a rotation or deletion candidate.',
      flags: [
        ['list-access-keys', 'Key IDs, status and creation date for the user.'],
        ['get-access-key-last-used', 'Date, service and region of the most recent use (updated roughly every 15 minutes).']
      ],
      output: { format: 'text', body: `AKIAIOSFODNN7EXAMPLE	2026-09-18T13:55:00+00:00	s3	us-east-1
AKIAI44QH8DHBEXAMPLE	None	N/A	N/A` },
      iam: ['iam:ListAccessKeys', 'iam:GetAccessKeyLastUsed'],
      related: ['iam-rotate-access-key', 'iam-credential-report'],
      tags: ['read-only', 'security', 'scripting']
    },
    {
      id: 'list-mfa-devices',
      subtopic: 'access-keys',
      title: 'List a user\'s MFA devices',
      command: `aws iam list-mfa-devices --user-name <user-name>`,
      description: 'Returns the serial numbers (ARNs for virtual devices) needed by `sts get-session-token` and `assume-role --serial-number`. An empty list on a user with console access is a finding in itself.',
      flags: [
        ['--user-name', 'Omit to list devices for the calling user.']
      ],
      output: { format: 'json', body: `{
    "MFADevices": [
        {
            "UserName": "alice",
            "SerialNumber": "arn:aws:iam::123456789012:mfa/alice",
            "EnableDate": "2024-02-11T09:20:15+00:00"
        }
    ]
}` },
      iam: ['iam:ListMFADevices'],
      related: ['sts-get-session-token-mfa', 'iam-credential-report'],
      tags: ['read-only', 'security']
    },
    {
      id: 'credential-report',
      subtopic: 'reports',
      title: 'Generate and download the account credential report (CSV)',
      command: `aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d > credential-report.csv
head -3 credential-report.csv`,
      description: 'One row per user (plus root) with password age, MFA status, key ages and last-used dates. It is the fastest way to answer auditors and to find keys older than your rotation policy.',
      flags: [
        ['generate-credential-report', 'Kicks off generation; returns `STARTED` or `COMPLETE`. Re-run `get` after a few seconds if you get `ReportInProgress`.'],
        ['--query Content --output text | base64 -d', 'The report is base64 in the JSON; decode to CSV.']
      ],
      output: { format: 'plain', body: `user,arn,user_creation_time,password_enabled,password_last_used,password_last_changed,password_next_rotation,mfa_active,access_key_1_active,access_key_1_last_rotated,access_key_1_last_used_date,access_key_1_last_used_region,access_key_1_last_used_service,access_key_2_active,access_key_2_last_rotated,access_key_2_last_used_date,access_key_2_last_used_region,access_key_2_last_used_service,cert_1_active,cert_1_last_rotated,cert_2_active,cert_2_last_rotated
<root_account>,arn:aws:iam::123456789012:root,2023-05-02T18:11:20+00:00,not_supported,2026-01-04T09:30:11+00:00,not_supported,not_supported,true,false,N/A,N/A,N/A,N/A,false,N/A,N/A,N/A,N/A,false,N/A,false,N/A
alice,arn:aws:iam::123456789012:user/alice,2024-02-11T09:12:44+00:00,true,2026-09-17T08:03:19+00:00,2026-06-01T10:00:00+00:00,2026-08-30T10:00:00+00:00,true,true,2026-03-15T12:00:00+00:00,2026-09-18T13:55:00+00:00,us-east-1,s3,false,N/A,N/A,N/A,N/A,false,N/A,false,N/A` },
      note: { type: 'info', text: 'The report is regenerated at most every four hours; calling generate again inside that window returns the cached one. Windows users: decode with `certutil -decode` or PowerShell instead of `base64 -d`.' },
      iam: ['iam:GenerateCredentialReport', 'iam:GetCredentialReport'],
      related: ['iam-access-key-last-used', 'iam-account-summary'],
      tags: ['read-only', 'security']
    },
    {
      id: 'account-summary',
      subtopic: 'reports',
      title: 'Account summary: root MFA, quotas and object counts',
      command: `aws iam get-account-summary \\
  --query 'SummaryMap.{RootMFA:AccountMFAEnabled,Users:Users,Roles:Roles,Policies:Policies,AccessKeysRoot:AccountAccessKeysPresent}'`,
      description: 'A single call that tells you whether root has MFA (`1` = yes) and root access keys (`0` = none), plus how close you are to IAM quotas. Also the quickest CIS benchmark check for a new account.',
      flags: [
        ['SummaryMap', 'Flat map of counters; the full list includes `*Quota` keys for every limit.']
      ],
      output: { format: 'json', body: `{
    "RootMFA": 1,
    "Users": 3,
    "Roles": 27,
    "Policies": 12,
    "AccessKeysRoot": 0
}` },
      iam: ['iam:GetAccountSummary'],
      related: ['iam-credential-report', 'security-org-list-accounts'],
      tags: ['read-only', 'security']
    },
    {
      id: 'create-instance-profile',
      subtopic: 'instance-profiles',
      title: 'Create an instance profile and put a role in it',
      command: `aws iam create-instance-profile --instance-profile-name <instance-profile-name>
aws iam add-role-to-instance-profile --instance-profile-name <instance-profile-name> --role-name <role-name>`,
      description: 'EC2 attaches roles through instance profiles, a container that holds exactly one role. The console creates the profile silently with the same name as the role; the CLI makes you do it explicitly.',
      flags: [
        ['create-instance-profile', 'Name is what `run-instances --iam-instance-profile Name=…` refers to.'],
        ['add-role-to-instance-profile', 'One role per profile. Removing it is `remove-role-from-instance-profile`.']
      ],
      output: { format: 'json', body: `{
    "InstanceProfile": {
        "Path": "/",
        "InstanceProfileName": "ssm-managed-instance",
        "InstanceProfileId": "AIPAEXAMPLEPROFILEID",
        "Arn": "arn:aws:iam::123456789012:instance-profile/ssm-managed-instance",
        "CreateDate": "2026-09-18T14:41:10+00:00",
        "Roles": []
    }
}` },
      note: { type: 'gotcha', text: 'IAM is eventually consistent: launching an instance with a profile created a second ago can fail with `Invalid IAM Instance Profile name`. Wait ~10 s or retry.' },
      iam: ['iam:CreateInstanceProfile', 'iam:AddRoleToInstanceProfile', 'iam:PassRole'],
      related: ['iam-create-role', 'iam-associate-instance-profile'],
      tags: ['mutating']
    },
    {
      id: 'associate-instance-profile',
      subtopic: 'instance-profiles',
      title: 'Attach or replace the instance profile on a running instance',
      command: `aws ec2 associate-iam-instance-profile \\
  --instance-id <instance-id> \\
  --iam-instance-profile Name=<instance-profile-name>
# to swap an existing one:
aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=<instance-id> --query 'IamInstanceProfileAssociations[0].AssociationId' --output text
aws ec2 replace-iam-instance-profile-association --association-id <association-id> --iam-instance-profile Name=<instance-profile-name>`,
      description: 'No stop required. If the instance already has a profile you must replace the association rather than associate a second one.',
      flags: [
        ['associate-iam-instance-profile', 'For instances with no profile.'],
        ['replace-iam-instance-profile-association', 'For instances that already have one; needs the association ID.']
      ],
      output: { format: 'json', body: `{
    "IamInstanceProfileAssociation": {
        "AssociationId": "iip-assoc-0abc123def4567890",
        "InstanceId": "i-0abc123def4567890",
        "IamInstanceProfile": {
            "Arn": "arn:aws:iam::123456789012:instance-profile/ssm-managed-instance",
            "Id": "AIPAEXAMPLEPROFILEID"
        },
        "State": "associating"
    }
}` },
      iam: ['ec2:AssociateIamInstanceProfile', 'ec2:ReplaceIamInstanceProfileAssociation', 'iam:PassRole'],
      related: ['iam-create-instance-profile', 'ssm-describe-instance-information'],
      tags: ['mutating']
    }
  ]
});
