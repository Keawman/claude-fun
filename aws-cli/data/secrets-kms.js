/* Topic: Secrets Manager & KMS */
AWSCHEAT.register({
  id: 'secrets-kms',
  title: 'Secrets Manager & KMS',
  order: 11,
  intro: 'Secrets Manager stores and rotates credentials; KMS holds the keys that encrypt them (and everything else). Most "AccessDenied" on secrets is actually a missing `kms:Decrypt` on the key.',
  subtopics: [
    { id: 'secrets', title: 'Secrets: read & write' },
    { id: 'rotation', title: 'Rotation & lifecycle' },
    { id: 'keys', title: 'KMS keys' },
    { id: 'crypto', title: 'Encrypt / decrypt' },
    { id: 'access', title: 'Grants & key policy' }
  ],
  cards: [
    {
      id: 'get-secret-value',
      subtopic: 'secrets',
      title: 'Read a secret\'s current value',
      command: `aws secretsmanager get-secret-value --secret-id <secret-name> --query SecretString --output text`,
      description: 'Returns the `AWSCURRENT` version. Secrets are usually JSON strings, so pipe into `jq` to extract one field, e.g. `| jq -r .password`.',
      flags: [
        ['--secret-id', 'Name or ARN. Partial ARNs work if unambiguous.'],
        ['--version-stage AWSPREVIOUS', '(optional) The value before the last rotation.'],
        ['--version-id', '(optional) A specific version UUID.']
      ],
      output: { format: 'json', body: `{"username":"app","password":"S3cr3t-Example-Passw0rd","host":"prod-db.abcdefghijkl.us-east-1.rds.amazonaws.com","port":5432,"dbname":"app"}` },
      note: { type: 'info', text: 'Binary secrets come back in `SecretBinary` (base64). Reads are billed per 10 000 API calls; cache in your application rather than fetching per request.' },
      iam: ['secretsmanager:GetSecretValue', 'kms:Decrypt'],
      related: ['secrets-kms-secret-to-env', 'secrets-kms-put-secret-value', 'ssm-get-parameter'],
      tags: ['read-only', 'security']
    },
    {
      id: 'secret-to-env',
      subtopic: 'secrets',
      title: 'Export a JSON secret\'s keys as environment variables',
      command: `eval "$(aws secretsmanager get-secret-value --secret-id <secret-name> --query SecretString --output text |
  jq -r 'to_entries[] | "export \\(.key | ascii_upcase)=\\(.value | @sh)"')"
echo "$USERNAME@$HOST:$PORT"`,
      description: 'Turns `{"username": …, "host": …}` into `USERNAME=…`, `HOST=…` with shell-safe quoting from `@sh`. Handy for local development and CI steps that expect env vars.',
      flags: [
        ['jq -r \'to_entries[] | …\'', 'Iterate key/value pairs of the JSON object.'],
        ['@sh', 'Quote values safely for `eval`.']
      ],
      output: { format: 'text', body: `app@prod-db.abcdefghijkl.us-east-1.rds.amazonaws.com:5432` },
      iam: ['secretsmanager:GetSecretValue', 'kms:Decrypt'],
      related: ['secrets-kms-get-secret-value', 'ssm-get-parameters-by-path'],
      tags: ['read-only', 'scripting', 'security']
    },
    {
      id: 'create-secret',
      subtopic: 'secrets',
      title: 'Create a secret from a JSON file with a customer KMS key',
      command: `aws secretsmanager create-secret \\
  --name prod/app/db \\
  --description "Primary DB credentials for app" \\
  --kms-key-id alias/<key-alias> \\
  --secret-string file://secret.json \\
  --tags Key=Environment,Value=prod`,
      description: 'Names are path-like by convention (`env/app/purpose`) so policies can use wildcards. Reading the value from a file keeps passwords out of shell history; delete the file afterwards.',
      flags: [
        ['--secret-string file://', 'Any string, typically JSON. `--secret-binary fileb://` for binary.'],
        ['--kms-key-id', 'Omit to use the AWS-managed `aws/secretsmanager` key, which cross-account consumers cannot use.'],
        ['--add-replica-regions Region=us-west-2', '(optional) Multi-region replication.']
      ],
      output: { format: 'json', body: `{
    "ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/app/db-AbCdEf",
    "Name": "prod/app/db",
    "VersionId": "0a1b2c3d-4e5f-6789-abcd-ef0123456789"
}` },
      note: { type: 'gotcha', text: 'The ARN gets a random six-character suffix. Policies should use `arn:…:secret:prod/app/db-*` or `-??????`, never the bare name.' },
      iam: ['secretsmanager:CreateSecret', 'secretsmanager:TagResource', 'kms:GenerateDataKey'],
      related: ['secrets-kms-put-secret-value', 'secrets-kms-list-secrets'],
      tags: ['mutating', 'security']
    },
    {
      id: 'put-secret-value',
      subtopic: 'secrets',
      title: 'Store a new version of a secret',
      command: `aws secretsmanager put-secret-value \\
  --secret-id <secret-name> \\
  --secret-string '{"username":"app","password":"<new-password>"}'`,
      description: 'Creates a new version labelled `AWSCURRENT` and moves the old one to `AWSPREVIOUS`. Versions without a staging label are pruned after 24 hours, so you keep one step of history for free.',
      flags: [
        ['--secret-string', 'Inline JSON or `file://`. Quote with single quotes in bash.'],
        ['--version-stages', '(optional) Custom labels; `AWSPENDING` is used by rotation functions.'],
        ['--client-request-token', '(optional) Idempotency UUID so retries do not create duplicate versions.']
      ],
      output: { format: 'json', body: `{
    "ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/app/db-AbCdEf",
    "Name": "prod/app/db",
    "VersionId": "1b2c3d4e-5f60-7182-93a4-b5c6d7e8f901",
    "VersionStages": [
        "AWSCURRENT"
    ]
}` },
      iam: ['secretsmanager:PutSecretValue', 'kms:GenerateDataKey'],
      related: ['secrets-kms-get-secret-value', 'secrets-kms-rotate-secret'],
      tags: ['mutating', 'security']
    },
    {
      id: 'list-secrets',
      subtopic: 'secrets',
      title: 'List secrets under a name prefix with rotation status',
      command: `aws secretsmanager list-secrets \\
  --filters Key=name,Values=prod/ \\
  --query 'SecretList[].[Name,RotationEnabled,LastRotatedDate,LastAccessedDate]' \\
  --output table`,
      description: 'Names, not values. `LastAccessedDate` (day granularity) reveals secrets nobody reads any more; `RotationEnabled: None` shows which ones are static.',
      flags: [
        ['--filters Key=name,Values=prod/', 'Prefix match. Other keys: `tag-key`, `tag-value`, `description`, `all`.'],
        ['--include-planned-deletion', '(optional) Show secrets scheduled for deletion.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------------------------------
|                                          ListSecrets                                          |
+-------------------+--------+------------------------------------+-----------------------------+
|  prod/app/db      |  True  |  2026-09-01T03:00:12.417000+00:00  |  2026-09-18T00:00:00+00:00  |
|  prod/app/apikey  |  None  |  None                              |  2026-09-18T00:00:00+00:00  |
|  prod/legacy/ftp  |  None  |  None                              |  2025-11-02T00:00:00+00:00  |
+-------------------+--------+------------------------------------+-----------------------------+` },
      iam: ['secretsmanager:ListSecrets'],
      related: ['secrets-kms-create-secret', 'secrets-kms-delete-secret'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'rotate-secret',
      subtopic: 'rotation',
      title: 'Enable automatic rotation with a Lambda function',
      command: `aws secretsmanager rotate-secret \\
  --secret-id <secret-name> \\
  --rotation-lambda-arn arn:aws:lambda:us-east-1:123456789012:function:<rotation-function> \\
  --rotation-rules AutomaticallyAfterDays=30 \\
  --rotate-immediately
aws secretsmanager describe-secret --secret-id <secret-name> \\
  --query '{Enabled:RotationEnabled,Days:RotationRules.AutomaticallyAfterDays,Next:NextRotationDate,Lambda:RotationLambdaARN}'`,
      description: 'Configures the schedule and kicks off the first rotation. The Lambda must implement the four-step contract (createSecret, setSecret, testSecret, finishSecret); AWS publishes templates for RDS, Redshift and DocumentDB.',
      flags: [
        ['--rotation-rules', '`AutomaticallyAfterDays=N` or `ScheduleExpression="cron(0 3 ? * SUN *)"` plus optional `Duration=2h` window.'],
        ['--rotate-immediately / --no-rotate-immediately', 'Whether to rotate now or wait for the first scheduled window.'],
        ['rotate-secret --secret-id <name>', 'Without other flags: trigger an on-demand rotation using the existing config.']
      ],
      output: { format: 'json', body: `{
    "ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/app/db-AbCdEf",
    "Name": "prod/app/db",
    "VersionId": "2c3d4e5f-6071-8293-a4b5-c6d7e8f90123"
}
{
    "Enabled": true,
    "Days": 30,
    "Next": "2026-10-18T00:00:00+00:00",
    "Lambda": "arn:aws:lambda:us-east-1:123456789012:function:SecretsManagerRDSPostgreSQLRotationSingleUser"
}` },
      note: { type: 'gotcha', text: 'The Lambda needs network access to the database (VPC config) and to the Secrets Manager endpoint (NAT or interface endpoint). A rotation stuck on `AWSPENDING` is nearly always one of those two.' },
      iam: ['secretsmanager:RotateSecret', 'secretsmanager:DescribeSecret', 'lambda:InvokeFunction'],
      related: ['secrets-kms-put-secret-value', 'vpc-create-endpoint'],
      tags: ['mutating', 'security']
    },
    {
      id: 'delete-secret',
      subtopic: 'rotation',
      title: 'Delete a secret with a recovery window (or immediately)',
      command: `aws secretsmanager delete-secret --secret-id <secret-name> --recovery-window-in-days 7
# undo within the window:
aws secretsmanager restore-secret --secret-id <secret-name>
# no recovery, name reusable at once:
aws secretsmanager delete-secret --secret-id <secret-name> --force-delete-without-recovery`,
      description: 'By default deletion is scheduled 30 days out and the secret is unreadable but restorable. Forced deletion is for rebuild loops where the same name must be recreated immediately.',
      flags: [
        ['--recovery-window-in-days', '7–30. Cannot be combined with force delete.'],
        ['--force-delete-without-recovery', 'Immediate and permanent. Secrets with replicas must have them removed first with `remove-regions-from-replication`.'],
        ['restore-secret', 'Cancels a scheduled deletion.']
      ],
      output: { format: 'json', body: `{
    "ARN": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/legacy/ftp-XyZ123",
    "Name": "prod/legacy/ftp",
    "DeletionDate": "2026-09-25T15:12:40.118000+00:00"
}` },
      iam: ['secretsmanager:DeleteSecret', 'secretsmanager:RestoreSecret'],
      related: ['secrets-kms-list-secrets'],
      tags: ['destructive', 'security']
    },
    {
      id: 'list-keys',
      subtopic: 'keys',
      title: 'List KMS keys with their aliases',
      command: `aws kms list-aliases \\
  --query 'Aliases[?TargetKeyId].[AliasName,TargetKeyId]' \\
  --output table`,
      description: '`list-keys` returns only IDs and ARNs; aliases are how humans refer to keys. Filtering on `TargetKeyId` hides AWS-reserved aliases that are not yet bound to a key.',
      flags: [
        ['Aliases[?TargetKeyId]', 'Only aliases that point at an existing key.'],
        ['--key-id <key-id>', '(optional) Aliases for one key.']
      ],
      output: { format: 'table', body: `-----------------------------------------------------------------------
|                             ListAliases                             |
+----------------------------+----------------------------------------+
|  alias/aws/ebs             |  1234abcd-12ab-34cd-56ef-1234567890ab  |
|  alias/aws/s3              |  2345bcde-23bc-45de-67f0-2345678901bc  |
|  alias/aws/secretsmanager  |  3456cdef-34cd-56ef-7801-3456789012cd  |
|  alias/app-secrets         |  4567def0-45de-67f0-8912-4567890123de  |
|  alias/s3-prod             |  5678ef01-56ef-7801-9a23-5678901234ef  |
+----------------------------+----------------------------------------+` },
      iam: ['kms:ListAliases'],
      related: ['secrets-kms-describe-key', 'secrets-kms-key-policy'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-key',
      subtopic: 'keys',
      title: 'Describe a key: state, origin, rotation and usage',
      command: `aws kms describe-key --key-id alias/<key-alias> \\
  --query 'KeyMetadata.{ID:KeyId,Arn:Arn,State:KeyState,Manager:KeyManager,Spec:KeySpec,Usage:KeyUsage,MultiRegion:MultiRegion,Deletion:DeletionDate}'
aws kms get-key-rotation-status --key-id alias/<key-alias>`,
      description: 'Confirms the key is `Enabled`, whether it is customer- or AWS-managed, and if annual rotation is on. `PendingDeletion` with a `DeletionDate` is the thing to catch before it is too late (`cancel-key-deletion`).',
      flags: [
        ['--key-id', 'Key ID, key ARN, alias name (`alias/x`) or alias ARN.'],
        ['get-key-rotation-status', 'Automatic rotation only applies to symmetric customer-managed keys. `enable-key-rotation --rotation-period-in-days 90` turns it on.']
      ],
      output: { format: 'json', body: `{
    "ID": "4567def0-45de-67f0-8912-4567890123de",
    "Arn": "arn:aws:kms:us-east-1:123456789012:key/4567def0-45de-67f0-8912-4567890123de",
    "State": "Enabled",
    "Manager": "CUSTOMER",
    "Spec": "SYMMETRIC_DEFAULT",
    "Usage": "ENCRYPT_DECRYPT",
    "MultiRegion": false,
    "Deletion": null
}
{
    "KeyRotationEnabled": true,
    "KeyId": "4567def0-45de-67f0-8912-4567890123de",
    "RotationPeriodInDays": 365,
    "NextRotationDate": "2027-03-14T10:00:00+00:00"
}` },
      iam: ['kms:DescribeKey', 'kms:GetKeyRotationStatus'],
      related: ['secrets-kms-list-keys', 'secrets-kms-key-policy', 's3-bucket-encryption'],
      tags: ['read-only']
    },
    {
      id: 'encrypt',
      subtopic: 'crypto',
      title: 'Encrypt a small file directly with a KMS key',
      command: `aws kms encrypt \\
  --key-id alias/<key-alias> \\
  --plaintext fileb://secret.txt \\
  --encryption-context purpose=config,env=prod \\
  --query CiphertextBlob --output text | base64 -d > secret.txt.enc`,
      description: 'Direct KMS encryption is limited to 4 KB and is meant for small secrets or data keys; larger payloads use envelope encryption (`generate-data-key`). The ciphertext blob is base64 in the JSON, so decode it before writing.',
      flags: [
        ['--plaintext fileb://', 'Binary-safe file read. Plain `file://` would treat the content as text; a literal string needs to be base64 in v2 (`--plaintext $(echo -n x | base64)`).'],
        ['--encryption-context', 'Key=value pairs bound to the ciphertext; the same pairs must be supplied to decrypt. Logged in CloudTrail, unlike the data.'],
        ['--query CiphertextBlob --output text | base64 -d', 'Extract and decode to raw bytes.']
      ],
      output: { format: 'none', body: '' },
      iam: ['kms:Encrypt'],
      related: ['secrets-kms-decrypt', 'secrets-kms-describe-key'],
      tags: ['read-only', 'security']
    },
    {
      id: 'decrypt',
      subtopic: 'crypto',
      title: 'Decrypt a KMS ciphertext blob',
      command: `aws kms decrypt \\
  --ciphertext-blob fileb://secret.txt.enc \\
  --encryption-context purpose=config,env=prod \\
  --query Plaintext --output text | base64 -d`,
      description: 'Symmetric ciphertexts embed the key ID, so `--key-id` is optional (but recommended as a guard). The plaintext is returned base64-encoded and must be decoded.',
      flags: [
        ['--ciphertext-blob fileb://', 'Raw ciphertext bytes as written by the encrypt card.'],
        ['--encryption-context', 'Must match exactly what was used at encryption or you get `InvalidCiphertextException`.'],
        ['--key-id', '(optional) Refuse to decrypt with any other key; required for asymmetric keys.']
      ],
      output: { format: 'plain', body: `db_password=S3cr3t-Example-Passw0rd` },
      iam: ['kms:Decrypt'],
      related: ['secrets-kms-encrypt', 'ssm-get-parameter'],
      tags: ['read-only', 'security']
    },
    {
      id: 'grants',
      subtopic: 'access',
      title: 'Create, list and retire a grant',
      command: `aws kms create-grant \\
  --key-id alias/<key-alias> \\
  --grantee-principal arn:aws:iam::123456789012:role/<role-name> \\
  --operations Decrypt GenerateDataKey \\
  --name app-runtime \\
  --query '[GrantId,GrantToken]' --output text
aws kms list-grants --key-id alias/<key-alias> --query 'Grants[].[GrantId,GranteePrincipal,Operations]' --output text
aws kms retire-grant --key-id <key-arn> --grant-id <grant-id>`,
      description: 'Grants give a principal temporary, operation-scoped access to a key without editing the key policy, which is how AWS services (EBS, RDS, Auto Scaling) use your keys. Listing them explains "who can decrypt with this key" beyond the policy.',
      flags: [
        ['--operations', 'Subset of Encrypt, Decrypt, GenerateDataKey*, ReEncrypt*, CreateGrant, DescribeKey, Sign, Verify, …'],
        ['--constraints EncryptionContextSubset={env=prod}', '(optional) Only allow use with matching encryption context.'],
        ['GrantToken', 'Use immediately after creation to avoid eventual-consistency delays.'],
        ['retire-grant vs revoke-grant', 'Retire is for the grantee/retiring principal; revoke is for the key owner. Both remove it.']
      ],
      output: { format: 'text', body: `0c237476b39f8bc44e45212e08498fbe3151305030726c0590dd8d3e9f3d6a60	AQpAM2RhZTk1MGMyNTk2ZmZmMzEyYWVhOWViN2I1MWM4Mzc0MWFiYjc0ZDE1ODkyNGFlNTIzODZhMzgyZjBlNGY3NiKIAgEBAgB4PayOOTaFyubHOoyO0jgezfPVFAy9DYmhQXd3oQOvMPMAAADfMIHcBgkqhkiG9w0BBwagVUzTc0wpSdpKKeUltn3mExample
0c237476b39f8bc44e45212e08498fbe3151305030726c0590dd8d3e9f3d6a60	arn:aws:iam::123456789012:role/web-instance-role	Decrypt	GenerateDataKey
7f2b1c9d8e3a4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e	arn:aws:iam::123456789012:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling	Decrypt	Encrypt	GenerateDataKey	ReEncryptFrom	ReEncryptTo	DescribeKey	CreateGrant` },
      note: { type: 'gotcha', text: 'Auto Scaling launching instances with encrypted EBS volumes from a customer key needs a grant (or key policy) for its service-linked role; without it instances launch and immediately terminate with `Client.InternalError`.' },
      iam: ['kms:CreateGrant', 'kms:ListGrants', 'kms:RetireGrant'],
      related: ['secrets-kms-key-policy', 'rds-elb-asg-r53-asg-describe'],
      tags: ['mutating', 'security']
    },
    {
      id: 'key-policy',
      subtopic: 'access',
      title: 'Read a key policy',
      command: `aws kms get-key-policy --key-id alias/<key-alias> --policy-name default --query Policy --output text | jq .`,
      description: 'The key policy is the primary access control for KMS; IAM policies only work if the key policy delegates to IAM (the `"kms:*"` for the account root statement). Every key has exactly one policy, always named `default`.',
      flags: [
        ['--policy-name default', 'Required and always `default`.'],
        ['put-key-policy --policy file://key-policy.json', 'Replace it. Losing the root/admin statement can make the key unmanageable; `--bypass-policy-lockout-safety-check` exists for a reason.']
      ],
      output: { format: 'json', body: `{
  "Version": "2012-10-17",
  "Id": "key-default-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow app role to use the key",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/web-instance-role"
      },
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "*"
    }
  ]
}` },
      iam: ['kms:GetKeyPolicy'],
      related: ['secrets-kms-grants', 'secrets-kms-describe-key', 'iam-get-policy-document'],
      tags: ['read-only', 'security']
    }
  ]
});
