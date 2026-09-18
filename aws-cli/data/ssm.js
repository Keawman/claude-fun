/* Topic: SSM (Systems Manager) */
AWSCHEAT.register({
  id: 'ssm',
  title: 'SSM',
  order: 8,
  intro: 'Systems Manager replaces SSH keys, bastions and config files: Session Manager for shells and port forwarding, Run Command for fleet-wide scripts, Parameter Store for configuration and secrets, and Patch Manager for compliance. Instances need the SSM agent, an instance profile with `AmazonSSMManagedInstanceCore`, and a path to the SSM endpoints.',
  subtopics: [
    { id: 'fleet', title: 'Managed instances' },
    { id: 'sessions', title: 'Session Manager' },
    { id: 'run-command', title: 'Run Command' },
    { id: 'parameters', title: 'Parameter Store' },
    { id: 'automation', title: 'Automation' },
    { id: 'patch-inventory', title: 'Patching & inventory' }
  ],
  cards: [
    {
      id: 'describe-instance-information',
      subtopic: 'fleet',
      title: 'List SSM-managed instances and agent status',
      command: `aws ssm describe-instance-information \\
  --query 'InstanceInformationList[].{ID:InstanceId,Ping:PingStatus,OS:PlatformName,Agent:AgentVersion,LastPing:LastPingDateTime,Name:ComputerName}' \\
  --output table`,
      description: 'If an instance is missing here, Session Manager and Run Command cannot reach it. The usual causes: no instance profile, no route to `ssm`/`ssmmessages`/`ec2messages` endpoints, or a stopped agent.',
      flags: [
        ['--filters Key=PingStatus,Values=ConnectionLost', '(optional) Only instances the agent stopped reporting from.'],
        ['--filters Key=tag:Environment,Values=prod', '(optional) Server-side tag filter.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------------------------------------------------------------------
|                                               DescribeInstanceInformation                                               |
+--------------+-----------------------+-----------------------------+----------------+----------------+------------------+
|    Agent     |           ID          |           LastPing          |      Name      |       OS       |       Ping       |
+--------------+-----------------------+-----------------------------+----------------+----------------+------------------+
|  3.3.987.0   |  i-0abc123def4567890  |  2026-09-18T14:58:02+00:00  |  ip-10-0-1-23  |  Amazon Linux  |  Online          |
|  3.3.987.0   |  i-0123456789abcdef0  |  2026-09-18T14:57:44+00:00  |  ip-10-0-2-45  |  Ubuntu        |  Online          |
|  3.2.2303.0  |  i-0fedcba9876543210  |  2026-09-11T03:12:19+00:00  |  ip-10-0-2-46  |  Ubuntu        |  ConnectionLost  |
+--------------+-----------------------+-----------------------------+----------------+----------------+------------------+` },
      iam: ['ssm:DescribeInstanceInformation'],
      related: ['ssm-start-session', 'iam-associate-instance-profile', 'vpc-describe-endpoints'],
      tags: ['read-only', 'query']
    },
    {
      id: 'start-session',
      subtopic: 'sessions',
      title: 'Open an interactive shell on an instance (no SSH, no bastion)',
      command: `aws ssm start-session --target <instance-id>`,
      description: 'Starts a shell over the SSM channel; traffic goes out from the instance to the SSM service, so no inbound security group rule or public IP is needed. Requires the Session Manager plugin on your machine.',
      flags: [
        ['--target', 'Instance ID (or `mi-…` for hybrid managed nodes).'],
        ['--document-name AWS-StartInteractiveCommand --parameters command="sudo journalctl -f"', '(optional) Run one command interactively instead of a shell.'],
        ['--reason "ticket-4521"', '(optional) Recorded in the session log for auditors.']
      ],
      output: { format: 'plain', body: `Starting session with SessionId: alice-0abc123def4567890

sh-5.2$ hostname
ip-10-0-1-23.ec2.internal
sh-5.2$ exit

Exiting session with sessionId: alice-0abc123def4567890.` },
      note: { type: 'gotcha', text: '`SessionManagerPlugin is not found` means the plugin is missing; install it from the AWS docs (it is a separate package). `TargetNotConnected` means the instance is not managed or its agent is offline: check `describe-instance-information`.' },
      iam: ['ssm:StartSession', 'ssm:TerminateSession'],
      related: ['ssm-describe-instance-information', 'ssm-port-forward', 'ec2-get-console-output'],
      tags: ['read-only', 'interactive']
    },
    {
      id: 'port-forward',
      subtopic: 'sessions',
      title: 'Forward a local port to a port on the instance',
      command: `aws ssm start-session --target <instance-id> \\
  --document-name AWS-StartPortForwardingSession \\
  --parameters 'portNumber=8080,localPortNumber=18080'`,
      description: 'Makes `localhost:18080` on your machine reach port 8080 on the instance through the SSM tunnel. Ideal for admin UIs and RDP (`portNumber=3389`) without exposing anything.',
      flags: [
        ['portNumber', 'Port on the instance.'],
        ['localPortNumber', 'Port on your machine (optional; a random one is chosen if omitted).']
      ],
      output: { format: 'plain', body: `Starting session with SessionId: alice-0123456789abcdef0
Port 18080 opened for sessionId alice-0123456789abcdef0.
Waiting for connections...

Connection accepted for session [alice-0123456789abcdef0]` },
      iam: ['ssm:StartSession'],
      related: ['ssm-port-forward-remote', 'ssm-start-session'],
      tags: ['read-only', 'interactive']
    },
    {
      id: 'port-forward-remote',
      subtopic: 'sessions',
      title: 'Tunnel to a private database through an instance',
      command: `aws ssm start-session --target <instance-id> \\
  --document-name AWS-StartPortForwardingSessionToRemoteHost \\
  --parameters 'host=<db-instance-id>.abcdefghijkl.us-east-1.rds.amazonaws.com,portNumber=5432,localPortNumber=15432'`,
      description: 'The instance acts as a jump host: the tunnel ends at any hostname it can reach, such as an RDS endpoint in a private subnet. Then `psql -h localhost -p 15432` connects as if you were in the VPC.',
      flags: [
        ['host', 'Hostname or IP reachable from the instance. The instance\'s security group must allow egress to it and the target must allow ingress from the instance.'],
        ['portNumber / localPortNumber', 'Remote and local ports.']
      ],
      output: { format: 'plain', body: `Starting session with SessionId: alice-0fedcba9876543210
Port 15432 opened for sessionId alice-0fedcba9876543210.
Waiting for connections...` },
      iam: ['ssm:StartSession'],
      related: ['ssm-port-forward', 'rds-elb-asg-r53-rds-describe-instances'],
      tags: ['read-only', 'interactive']
    },
    {
      id: 'send-command',
      subtopic: 'run-command',
      title: 'Run a shell script on specific instances',
      command: `aws ssm send-command \\
  --document-name AWS-RunShellScript \\
  --instance-ids <instance-id> <instance-id-2> \\
  --parameters 'commands=["uptime","df -h /","systemctl is-active nginx"]' \\
  --comment "health check" \\
  --query 'Command.{ID:CommandId,Status:Status,Targets:InstanceIds}'`,
      description: 'Asynchronous: the call returns a command ID immediately and the agent executes the script as root. Fetch results per instance with `get-command-invocation`. Use `AWS-RunPowerShellScript` for Windows.',
      flags: [
        ['--parameters commands=[…]', 'JSON list of shell lines. For long scripts use `--parameters file://params.json` or a custom document.'],
        ['--timeout-seconds', '(optional) How long the agent may take to start execution (default 600).'],
        ['--output-s3-bucket-name', '(optional) Store full stdout/stderr in S3; the API truncates output to 24 000 characters.'],
        ['--cloud-watch-output-config CloudWatchOutputEnabled=true', '(optional) Stream output to CloudWatch Logs.']
      ],
      output: { format: 'json', body: `{
    "ID": "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
    "Status": "Pending",
    "Targets": [
        "i-0abc123def4567890",
        "i-0123456789abcdef0"
    ]
}` },
      iam: ['ssm:SendCommand'],
      related: ['ssm-get-command-invocation', 'ssm-send-command-by-tag'],
      tags: ['mutating']
    },
    {
      id: 'get-command-invocation',
      subtopic: 'run-command',
      title: 'Read the output of a Run Command execution',
      command: `aws ssm get-command-invocation \\
  --command-id <command-id> \\
  --instance-id <instance-id> \\
  --query '{Status:Status,Code:ResponseCode,Out:StandardOutputContent,Err:StandardErrorContent}'`,
      description: 'One call per instance. `Status` moves Pending → InProgress → Success/Failed; poll until it leaves InProgress or use `aws ssm wait command-executed`.',
      flags: [
        ['--command-id', 'From `send-command`.'],
        ['--instance-id', 'One target at a time; `list-command-invocations --command-id … --details` returns all of them.'],
        ['aws ssm wait command-executed --command-id … --instance-id …', 'Waiter that blocks until completion (exits non-zero if the command failed).']
      ],
      output: { format: 'json', body: `{
    "Status": "Success",
    "Code": 0,
    "Out": " 14:59:31 up 12 days,  3:07,  0 users,  load average: 0.08, 0.05, 0.01\\nFilesystem      Size  Used Avail Use% Mounted on\\n/dev/nvme0n1p1   30G   11G   20G  36% /\\nactive\\n",
    "Err": ""
}` },
      iam: ['ssm:GetCommandInvocation'],
      related: ['ssm-send-command', 'ssm-list-command-invocations'],
      tags: ['read-only']
    },
    {
      id: 'send-command-by-tag',
      subtopic: 'run-command',
      title: 'Target a fleet by tag with concurrency and error limits',
      command: `aws ssm send-command \\
  --document-name AWS-RunShellScript \\
  --targets "Key=tag:Environment,Values=prod" "Key=tag:Role,Values=web" \\
  --parameters 'commands=["sudo systemctl reload nginx"]' \\
  --max-concurrency 25% \\
  --max-errors 1 \\
  --query Command.CommandId --output text`,
      description: 'Tag targeting resolves to whatever instances match at run time, so new hosts are included automatically. Rolling limits keep a bad script from taking down the whole tier at once.',
      flags: [
        ['--targets Key=tag:…', 'Multiple targets are ANDed. Also `Key=InstanceIds`, `Key=resource-groups:Name`.'],
        ['--max-concurrency', 'Absolute number or percentage of targets running at once.'],
        ['--max-errors', 'Stop scheduling new instances after this many failures (number or percentage).']
      ],
      output: { format: 'text', body: `1b2c3d4e-5f60-7182-93a4-b5c6d7e8f901` },
      iam: ['ssm:SendCommand', 'ec2:DescribeInstances'],
      related: ['ssm-list-command-invocations', 'ssm-send-command'],
      tags: ['mutating']
    },
    {
      id: 'list-command-invocations',
      subtopic: 'run-command',
      title: 'Summarise per-instance results of a fleet command',
      command: `aws ssm list-command-invocations \\
  --command-id <command-id> \\
  --query 'CommandInvocations[].[InstanceId,Status,StatusDetails]' \\
  --output table`,
      description: 'One row per target. `StatusDetails` is more specific than `Status`: `DeliveryTimedOut` (agent offline), `ExecutionTimedOut`, `Failed` (non-zero exit), `Cancelled`.',
      flags: [
        ['--details', '(optional) Include stdout/stderr per plugin in the response.'],
        ['--filters key=Status,value=Failed', '(optional) Only failures. Note the lowercase key/value here.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------
|                 ListCommandInvocations                 |
+-----------------------+-----------+--------------------+
|  i-0abc123def4567890  |  Success  |  Success           |
|  i-0123456789abcdef0  |  Success  |  Success           |
|  i-0fedcba9876543210  |  Failed   |  DeliveryTimedOut  |
+-----------------------+-----------+--------------------+` },
      iam: ['ssm:ListCommandInvocations'],
      related: ['ssm-send-command-by-tag', 'ssm-get-command-invocation'],
      tags: ['read-only', 'query']
    },
    {
      id: 'get-parameter',
      subtopic: 'parameters',
      title: 'Read a parameter (decrypting SecureString)',
      command: `aws ssm get-parameter --name /prod/db/password --with-decryption --query Parameter.Value --output text`,
      description: 'Returns the value of one parameter. Without `--with-decryption` a SecureString comes back as ciphertext, which is a common source of "the password is wrong" confusion.',
      flags: [
        ['--with-decryption', 'Decrypt SecureString values (needs `kms:Decrypt` on the key).'],
        ['--name', 'Full path. Add `:3` or `:label` after the name to fetch a specific version or label.'],
        ['get-parameters --names a b c', 'Batch form for up to 10 names; missing ones are listed in `InvalidParameters` rather than failing.']
      ],
      output: { format: 'text', body: `S3cr3t-Example-Passw0rd` },
      iam: ['ssm:GetParameter', 'kms:Decrypt'],
      related: ['ssm-put-parameter', 'ssm-get-parameters-by-path'],
      tags: ['read-only', 'security']
    },
    {
      id: 'put-parameter',
      subtopic: 'parameters',
      title: 'Create or update a SecureString parameter',
      command: `aws ssm put-parameter \\
  --name /prod/db/password \\
  --value "$(openssl rand -base64 24)" \\
  --type SecureString \\
  --key-id alias/<key-alias> \\
  --overwrite \\
  --tier Standard`,
      description: 'Writes a new version. Without `--overwrite` an existing name fails with `ParameterAlreadyExists`, which is the safe default for scripts that should only create.',
      flags: [
        ['--type', '`String`, `StringList` (comma-separated) or `SecureString` (KMS-encrypted).'],
        ['--key-id', 'KMS key for SecureString; default is `alias/aws/ssm`.'],
        ['--overwrite', 'Required to update an existing parameter. Cannot be combined with `--tags`.'],
        ['--tier', '`Standard` (4 KB, free) or `Advanced` (8 KB, policies, cost per parameter).']
      ],
      output: { format: 'json', body: `{
    "Version": 4,
    "Tier": "Standard"
}` },
      iam: ['ssm:PutParameter', 'kms:Encrypt'],
      related: ['ssm-get-parameter', 'secrets-kms-get-secret-value'],
      tags: ['mutating', 'security']
    },
    {
      id: 'get-parameters-by-path',
      subtopic: 'parameters',
      title: 'Load a whole path of parameters as environment variables',
      command: `eval "$(aws ssm get-parameters-by-path --path /prod/app/ --recursive --with-decryption \\
  --query 'Parameters[].[Name,Value]' --output text |
  awk -F'\\t' '{ n=$1; sub(".*/", "", n); printf "export %s=%s\\n", toupper(n), $2 }')"
env | grep -E '^(DB_HOST|DB_PORT)='`,
      description: 'Fetches every parameter under a hierarchy in one paginated call and turns `/prod/app/db_host` into `DB_HOST=…`. This is the twelve-factor config pattern for containers and CI without a config file.',
      flags: [
        ['--path', 'Hierarchy prefix; must start with `/`.'],
        ['--recursive', 'Include nested paths (`/prod/app/cache/…`).'],
        ['--with-decryption', 'Decrypt SecureStrings in the set.'],
        ['--parameter-filters Key=Type,Values=SecureString', '(optional) Only one type.']
      ],
      output: { format: 'text', body: `DB_HOST=prod-db.abcdefghijkl.us-east-1.rds.amazonaws.com
DB_PORT=5432` },
      note: { type: 'gotcha', text: 'The API returns at most 10 parameters per page; the CLI paginates automatically, but a hand-written SDK loop must handle `NextToken`. Values containing newlines break the `awk` one-liner; quote them or use JSON output.' },
      iam: ['ssm:GetParametersByPath', 'kms:Decrypt'],
      related: ['ssm-get-parameter', 'output-query-yaml', 'scripting-jq-vs-query'],
      tags: ['read-only', 'scripting', 'security']
    },
    {
      id: 'describe-parameters',
      subtopic: 'parameters',
      title: 'List parameters under a prefix with type and last change',
      command: `aws ssm describe-parameters \\
  --parameter-filters Key=Path,Option=Recursive,Values=/prod/ \\
  --query 'Parameters[].[Name,Type,Version,LastModifiedDate]' \\
  --output text`,
      description: 'Metadata only, no values, so it is safe to run with minimal permissions. `Version` and `LastModifiedDate` tell you whether a rotation actually happened.',
      flags: [
        ['--parameter-filters Key=Path,Option=Recursive', 'Server-side prefix filter. Other keys: `Name`, `Type`, `KeyId`, `tag:<key>`.'],
        ['delete-parameter --name', 'Remove one; `delete-parameters --names a b` for up to 10.']
      ],
      output: { format: 'text', body: `/prod/app/db_host	String	1	2026-08-30T10:11:02.001000+00:00
/prod/app/db_port	String	1	2026-08-30T10:11:05.412000+00:00
/prod/db/password	SecureString	4	2026-09-18T15:02:37.880000+00:00` },
      iam: ['ssm:DescribeParameters'],
      related: ['ssm-get-parameters-by-path', 'ssm-put-parameter'],
      tags: ['read-only', 'query']
    },
    {
      id: 'start-automation',
      subtopic: 'automation',
      title: 'Start an Automation runbook and check its result',
      command: `EXEC_ID=$(aws ssm start-automation-execution \\
  --document-name AWS-RestartEC2Instance \\
  --parameters InstanceId=<instance-id> \\
  --query AutomationExecutionId --output text)
aws ssm get-automation-execution --automation-execution-id "$EXEC_ID" \\
  --query 'AutomationExecution.{Status:AutomationExecutionStatus,Step:CurrentStepName,Failure:FailureMessage}'`,
      description: 'Automation documents orchestrate multi-step operations (restart, create AMI, patch, resize) with approvals and rollbacks. AWS ships hundreds under the `AWS-` prefix; `list-documents --filters Key=DocumentType,Values=Automation` shows them.',
      flags: [
        ['--parameters', 'Document inputs as `Key=Value`; list inputs as `Key=v1,v2`.'],
        ['--target-parameter-name InstanceId --targets Key=tag:…', '(optional) Rate-controlled execution across many resources.'],
        ['AutomationExecutionStatus', 'Pending, InProgress, Waiting, Success, TimedOut, Cancelled, Failed.']
      ],
      output: { format: 'json', body: `{
    "Status": "Success",
    "Step": null,
    "Failure": null
}` },
      iam: ['ssm:StartAutomationExecution', 'ssm:GetAutomationExecution', 'ec2:StopInstances', 'ec2:StartInstances'],
      related: ['ssm-describe-automation-executions', 'ec2-reboot-instances'],
      tags: ['mutating']
    },
    {
      id: 'describe-automation-executions',
      subtopic: 'automation',
      title: 'List recent failed Automation executions',
      command: `aws ssm describe-automation-executions \\
  --filters Key=ExecutionStatus,Values=Failed \\
  --query 'AutomationExecutionMetadataList[].[AutomationExecutionId,DocumentName,ExecutionStartTime,FailureMessage]' \\
  --output text`,
      description: 'Automations triggered by EventBridge, Config remediation or maintenance windows fail quietly. This is the sweep to find them.',
      flags: [
        ['--filters Key=ExecutionStatus', 'Also `DocumentNamePrefix`, `StartTimeBefore/After`, `TagKey`.']
      ],
      output: { format: 'text', body: `3a4b5c6d-7e8f-9012-a3b4-c5d6e7f80912	AWS-CreateImage	2026-09-18T03:00:04.118000+00:00	Step createImage failed: InvalidInstanceID.NotFound` },
      iam: ['ssm:DescribeAutomationExecutions'],
      related: ['ssm-start-automation'],
      tags: ['read-only', 'query']
    },
    {
      id: 'patch-compliance',
      subtopic: 'patch-inventory',
      title: 'Patch compliance per instance (missing and failed counts)',
      command: `aws ssm describe-instance-patch-states-for-patch-group --patch-group <patch-group> \\
  --query 'InstancePatchStates[].{ID:InstanceId,Missing:MissingCount,Failed:FailedCount,Installed:InstalledCount,Reboot:RebootOption,LastRun:OperationEndTime,Op:Operation}' \\
  --output table`,
      description: 'The scoreboard after a `AWS-RunPatchBaseline` scan or install. Anything with `Missing` above zero is out of compliance with its baseline; `Failed` means the install attempt errored.',
      flags: [
        ['--patch-group', 'Value of the instance\'s `Patch Group` tag. Use `describe-instance-patch-states --instance-ids …` for specific instances.'],
        ['describe-instance-patches --instance-id … --filters Key=State,Values=Missing', 'Follow-up: which patches exactly.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------------------------------------------------------------
|                                       DescribeInstancePatchStatesForPatchGroup                                       |
+----------+-----------------------+-------------+-----------------------------+-----------+--------+------------------+
|  Failed  |           ID          |  Installed  |           LastRun           |  Missing  |   Op   |      Reboot      |
+----------+-----------------------+-------------+-----------------------------+-----------+--------+------------------+
|  0       |  i-0abc123def4567890  |  412        |  2026-09-15T04:12:41+00:00  |  0        |  Scan  |  RebootIfNeeded  |
|  1       |  i-0123456789abcdef0  |  398        |  2026-09-15T04:13:02+00:00  |  7        |  Scan  |  RebootIfNeeded  |
+----------+-----------------------+-------------+-----------------------------+-----------+--------+------------------+` },
      iam: ['ssm:DescribeInstancePatchStatesForPatchGroup'],
      related: ['ssm-compliance-summary', 'ssm-send-command-by-tag'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'compliance-summary',
      subtopic: 'patch-inventory',
      title: 'Non-compliant resources across compliance types',
      command: `aws ssm list-resource-compliance-summaries \\
  --filters Key=Status,Values=NON_COMPLIANT,Type=EQUAL \\
  --query 'ResourceComplianceSummaryItems[].[ResourceId,ComplianceType,NonCompliantSummary.NonCompliantCount,NonCompliantSummary.SeveritySummary.CriticalCount]' \\
  --output text`,
      description: 'One row per resource that fails any compliance type (Patch, Association, custom). The severity breakdown tells you what to fix first.',
      flags: [
        ['--filters Key=ComplianceType,Values=Patch,Type=EQUAL', '(optional) Only patch compliance.'],
        ['list-compliance-items --resource-ids <instance-id> --resource-types ManagedInstance', 'Drill into the individual failing items.']
      ],
      output: { format: 'text', body: `i-0123456789abcdef0	Patch	7	2
i-0fedcba9876543210	Association	1	0` },
      iam: ['ssm:ListResourceComplianceSummaries'],
      related: ['ssm-patch-compliance', 'security-config-noncompliant-rules'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'inventory',
      subtopic: 'patch-inventory',
      title: 'Query software inventory: which instances have a package installed',
      command: `aws ssm get-inventory \\
  --filters Key=AWS:Application.Name,Values=openssl,Type=Equal \\
  --query 'Entities[].[Id,Data."AWS:Application".Content[0].Version]' \\
  --output text`,
      description: 'Inventory collects installed applications, network config, Windows updates and more from every managed instance. Filtering by application name answers "who still runs the vulnerable version" without touching a host.',
      flags: [
        ['--filters Key=AWS:Application.Name', 'Inventory type and attribute. Types include `AWS:InstanceInformation`, `AWS:Application`, `AWS:Service`, `AWS:WindowsUpdate`.'],
        ['Type=BeginWith|Equal|NotEqual|LessThan|GreaterThan|Exists', 'Comparison operator.'],
        ['list-inventory-entries --instance-id … --type-name AWS:Application', 'Full application list for one instance.']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	3.0.8
i-0123456789abcdef0	3.0.13
i-0fedcba9876543210	1.1.1w` },
      note: { type: 'info', text: 'Inventory must be enabled by an association (`AWS-GatherSoftwareInventory`), typically via Quick Setup. Data is collected every 30 minutes by default.' },
      iam: ['ssm:GetInventory'],
      related: ['ssm-patch-compliance', 'security-inspector-findings'],
      tags: ['read-only', 'query', 'security']
    }
  ]
});
