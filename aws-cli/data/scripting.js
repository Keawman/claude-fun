/* Topic: Scripting recipes */
AWSCHEAT.register({
  id: 'scripting',
  title: 'Scripting recipes',
  order: 17,
  intro: 'Patterns for using the CLI inside bash: iterate over resources, regions and accounts; choose between `--query` and `jq`; handle errors and exit codes; preview with `--dry-run`; and drive complex calls from JSON files. Every recipe assumes `set -euo pipefail` at the top of the script.',
  subtopics: [
    { id: 'loops', title: 'Loops' },
    { id: 'json', title: 'JSON handling' },
    { id: 'errors', title: 'Errors, exit codes, retries' },
    { id: 'preview', title: 'Dry runs & skeletons' },
    { id: 'parallel', title: 'Parallelism' }
  ],
  cards: [
    {
      id: 'loop-instances',
      subtopic: 'loops',
      title: 'Loop over instances and act on each',
      command: `aws ec2 describe-instances \\
  --filters Name=tag:Environment,Values=staging Name=instance-state-name,Values=running \\
  --query 'Reservations[].Instances[].[InstanceId,Tags[?Key==\`Name\`]|[0].Value]' --output text |
while IFS=$'\\t' read -r id name; do
  echo "stopping $name ($id)"
  aws ec2 stop-instances --instance-ids "$id" --query 'StoppingInstances[0].CurrentState.Name' --output text
done`,
      description: 'Text output with one instance per line feeds a `while read` loop; splitting on tabs keeps names with spaces intact. Reading from the pipe rather than a `for` over `$(...)` also handles large fleets without building a giant argument list.',
      flags: [
        ['IFS=$\'\\t\' read -r id name', 'Tab-only splitting; `-r` keeps backslashes literal.'],
        ['--output text', 'One row per instance, columns in `--query` order.'],
        ['< <(aws …)', 'Alternative process substitution if the loop body must modify outer variables (a pipe runs the loop in a subshell).']
      ],
      output: { format: 'plain', body: `stopping worker-1 (i-0123456789abcdef0)
stopping
stopping worker-2 (i-0fedcba9876543210)
stopping` },
      iam: ['ec2:DescribeInstances', 'ec2:StopInstances'],
      related: ['ec2-describe-instances-by-tag', 'scripting-xargs-parallel'],
      tags: ['mutating', 'scripting']
    },
    {
      id: 'loop-regions',
      subtopic: 'loops',
      title: 'Run a command in every enabled region',
      command: `for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
  n=$(aws ec2 describe-instances --region "$r" --query 'length(Reservations[].Instances[])' --output text)
  printf '%-16s %s\\n' "$r" "$n"
done`,
      description: 'Most resources are regional and the console only shows one region at a time. This is how you find the forgotten instance in ap-southeast-2. `describe-regions` returns only enabled regions, so opt-in regions you never enabled are skipped safely.',
      flags: [
        ['--region "$r"', 'Overrides the profile region for each call.'],
        ['length(…)', 'Counting client-side keeps each call to a single number.'],
        ['AWS_MAX_ATTEMPTS=10 AWS_RETRY_MODE=adaptive', '(optional) Prefix the loop with these to survive throttling when running many calls quickly.']
      ],
      output: { format: 'plain', body: `ap-northeast-1   0
ap-southeast-2   1
eu-central-1     0
eu-west-1        12
us-east-1        43
us-west-2        7` },
      iam: ['ec2:DescribeRegions', 'ec2:DescribeInstances'],
      related: ['setup-regions-table', 'scripting-loop-profiles'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'loop-profiles',
      subtopic: 'loops',
      title: 'Run the same check across every profile (account)',
      command: `for p in $(aws configure list-profiles); do
  printf '%-20s ' "$p"
  aws sts get-caller-identity --profile "$p" --query '[Account,Arn]' --output text 2>/dev/null || echo "(no credentials)"
done`,
      description: 'Each profile maps to an account and role, so iterating profiles is the simplest multi-account loop when you do not have Organizations-wide role assumption set up. The `|| echo` keeps the loop going past expired SSO sessions.',
      flags: [
        ['aws configure list-profiles', 'Every profile in config and credentials files.'],
        ['2>/dev/null || echo', 'Swallow the error and continue; drop the redirect when debugging.']
      ],
      output: { format: 'plain', body: `default              123456789012	arn:aws:iam::123456789012:user/alice
dev                  123456789012	arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice
prod-readonly        (no credentials)
gov                  123456789012	arn:aws-us-gov:iam::123456789012:user/alice` },
      iam: ['sts:GetCallerIdentity'],
      related: ['setup-list-profiles', 'security-org-list-accounts', 'govcloud-arns'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'jq-vs-query',
      subtopic: 'json',
      title: 'The same extraction with --query and with jq',
      command: `# JMESPath: no extra tool, runs before output formatting
aws ec2 describe-volumes --query 'Volumes[?Size>\`100\`].{id:VolumeId,gb:Size}' --output json
# jq: richer language (arithmetic, string ops, grouping), needs the binary
aws ec2 describe-volumes --output json | jq '[.Volumes[] | select(.Size > 100) | {id: .VolumeId, gb: .Size}]'
# jq wins for aggregation:
aws ec2 describe-volumes --output json | jq '[.Volumes[].Size] | add'`,
      description: 'Use `--query` for selection and projection, which covers most needs and works everywhere the CLI does. Reach for `jq` when you need arithmetic, `group_by`, string formatting (`@tsv`, `@csv`) or to parse JSON-in-a-string fields such as CloudTrail events and secrets.',
      flags: [
        ['--query … --output json', 'JMESPath result rendered as JSON (4-space indent).'],
        ['jq \'[.a[] | select(…) | {…}]\'', 'Filter and reshape in jq.'],
        ['jq -r \'.[] | @tsv\'', 'Raw tab-separated rows for shell loops.']
      ],
      output: { format: 'json', body: `[
    {
        "id": "vol-0fedcba9876543210",
        "gb": 500
    }
]
[
  {
    "id": "vol-0fedcba9876543210",
    "gb": 500
  }
]
630` },
      iam: ['ec2:DescribeVolumes'],
      related: ['output-query-filters', 'output-query-text-shapes', 'cloudtrail-parse-event'],
      tags: ['read-only', 'scripting', 'jmespath']
    },
    {
      id: 'exit-codes',
      subtopic: 'errors',
      title: 'Handle errors by exit code and captured stderr',
      command: `if ! out=$(aws ec2 describe-instances --instance-ids <instance-id> --output json 2>&1); then
  rc=$?
  case "$rc" in
    253) echo "config error (no region/credentials): $out" ;;
    254) echo "service error: $out" ;;
    255) echo "general failure: $out" ;;
    *)   echo "exit $rc: $out" ;;
  esac
  exit "$rc"
fi
echo "$out" | jq -r '.Reservations[0].Instances[0].State.Name'`,
      description: 'The CLI uses distinct exit codes: 0 success, 1 a command-specific failure (e.g. `s3` partial transfer), 2 usage error, 130 Ctrl-C, 252 invalid arguments, 253 configuration problem, 254 the service returned an error, 255 general/unhandled. Capturing stderr into the same variable keeps the AWS error message for the log.',
      flags: [
        ['2>&1', 'Merge stderr so the `An error occurred (…)` line is captured.'],
        ['254', 'API-level error: AccessDenied, NotFound, Throttling, validation. The message names the error code.'],
        ['253', 'Missing region, bad profile, expired SSO: fix config, do not retry.']
      ],
      output: { format: 'stderr', body: `service error: An error occurred (InvalidInstanceID.NotFound) when calling the DescribeInstances operation: The instance ID 'i-0abc123def4567890' does not exist` },
      note: { type: 'info', text: 'Waiters exit 255 on timeout. `s3 sync` exits 1 when some files failed but others succeeded, and 2 for bad arguments; check the summary on stderr before assuming a full failure.' },
      iam: ['ec2:DescribeInstances'],
      related: ['scripting-retries', 'output-query-waiters', 'sts-decode-authorization-message'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'retries',
      subtopic: 'errors',
      title: 'Configure retries, timeouts and quiet output for scripts',
      command: `export AWS_RETRY_MODE=adaptive AWS_MAX_ATTEMPTS=10 AWS_PAGER=""
aws ec2 describe-instances \\
  --cli-connect-timeout 10 --cli-read-timeout 60 \\
  --no-cli-pager --color off \\
  --query 'length(Reservations[])' --output text`,
      description: 'Throttling (`RequestLimitExceeded`, `ThrottlingException`) is normal at fleet scale; the adaptive retry mode backs off client-side so scripts succeed instead of failing. Explicit timeouts stop a hung proxy from stalling a pipeline forever.',
      flags: [
        ['AWS_RETRY_MODE', '`legacy` (default in v1), `standard` (v2 default, 3 attempts), `adaptive` (client-side rate limiting).'],
        ['AWS_MAX_ATTEMPTS', 'Total attempts including the first. Also `max_attempts` in the profile.'],
        ['--cli-connect-timeout / --cli-read-timeout', 'Seconds; 0 disables. Defaults are 60/60.'],
        ['--color off', 'No ANSI codes in logs.']
      ],
      output: { format: 'text', body: `38` },
      iam: ['ec2:DescribeInstances'],
      related: ['scripting-exit-codes', 'setup-pager', 'scripting-debug'],
      tags: ['read-only', 'scripting', 'config']
    },
    {
      id: 'debug',
      subtopic: 'errors',
      title: 'Debug a failing call: endpoint, credentials, request',
      command: `aws s3api list-buckets --debug 2>&1 | grep -E 'Found credentials|Making request|Response headers|Error' | head`,
      description: '`--debug` logs credential resolution (which profile/role/env var won), the resolved endpoint, retries and the raw HTTP exchange. Grep it down to the interesting lines; the full log is thousands of lines.',
      flags: [
        ['--debug', 'Verbose botocore logging to stderr.'],
        ['Found credentials in …', 'Tells you the credential source: env, shared-credentials-file, sso, assume-role, container-role, iam-role (IMDS).'],
        ['Making request for OperationModel(…) … url=', 'The exact endpoint and region used.']
      ],
      output: { format: 'plain', body: `2026-09-18 15:22:01,118 - MainThread - botocore.credentials - INFO - Found credentials in shared credentials file: ~/.aws/credentials
2026-09-18 15:22:01,231 - MainThread - botocore.endpoint - DEBUG - Making request for OperationModel(name=ListBuckets) with params: {'url_path': '/', 'query_string': '', 'method': 'GET', 'headers': {...}, 'body': b'', 'url': 'https://s3.us-east-1.amazonaws.com/', ...}
2026-09-18 15:22:01,402 - MainThread - botocore.parsers - DEBUG - Response headers: {'x-amz-id-2': '...', 'x-amz-request-id': 'EXAMPLE0123456789', 'Content-Type': 'application/xml'}` },
      iam: ['s3:ListAllMyBuckets'],
      related: ['setup-configure-list', 'govcloud-fips-endpoints', 'scripting-retries'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'dry-run',
      subtopic: 'preview',
      title: 'Check permissions without doing anything (--dry-run)',
      command: `aws ec2 terminate-instances --instance-ids <instance-id> --dry-run`,
      description: 'EC2 (and a few other services) evaluate IAM and parameters, then return `DryRunOperation` instead of acting. Success looks like an error: exit code 254 with that specific code. `UnauthorizedOperation` means you would have been denied.',
      flags: [
        ['--dry-run', 'Available on most `aws ec2` mutating commands; not on S3, IAM or most other services (use `simulate-principal-policy` there).'],
        ['`grep -q DryRunOperation`', 'How a script treats the dry run as a pass.']
      ],
      output: { format: 'stderr', body: `An error occurred (DryRunOperation) when calling the TerminateInstances operation: Request would have succeeded, but DryRun flag is set.` },
      iam: ['ec2:TerminateInstances'],
      related: ['ec2-terminate-instances', 'iam-simulate-principal-policy', 's3-sync'],
      tags: ['read-only', 'scripting', 'security']
    },
    {
      id: 'cli-input-json',
      subtopic: 'preview',
      title: 'Generate a skeleton and drive a command from a JSON file',
      command: `aws ec2 run-instances --generate-cli-skeleton input > run.json
# edit run.json, remove keys you don't need, then:
aws ec2 run-instances --cli-input-json file://run.json --dry-run
# see what the response will look like:
aws ec2 run-instances --generate-cli-skeleton output | head -20`,
      description: 'For commands with deeply nested parameters (block device mappings, network interfaces, tag specs) a JSON file beats a wall of shorthand syntax. The skeleton lists every parameter with placeholder values; keys are the API\'s CamelCase names.',
      flags: [
        ['--generate-cli-skeleton input', 'Print a template of all input parameters and exit without calling AWS.'],
        ['--generate-cli-skeleton output', 'Print the shape of the response (handy for writing `--query` expressions).'],
        ['--cli-input-json file://', 'Load parameters from the file; explicit flags on the command line override file values.'],
        ['--cli-input-yaml', 'Same, in YAML (`--generate-cli-skeleton yaml-input`).']
      ],
      output: { format: 'json', body: `{
    "BlockDeviceMappings": [
        {
            "DeviceName": "",
            "VirtualName": "",
            "Ebs": {
                "DeleteOnTermination": true,
                "Iops": 0,
                "SnapshotId": "",
                "VolumeSize": 0,
                "VolumeType": "gp3",
                "KmsKeyId": "",
                "Throughput": 0,
                "Encrypted": true
            }
        }
    ],
    "ImageId": "",
    "InstanceType": "t3.micro",
    "KeyName": "",
    "MaxCount": 0,
    "MinCount": 0
}` },
      note: { type: 'gotcha', text: 'Skeletons contain every optional parameter; leaving placeholder empty strings in place causes validation errors. Delete everything you do not set. Binary fields (`UserData`) must be base64 in the JSON.' },
      iam: ['ec2:RunInstances'],
      related: ['ec2-run-instances', 'cloudwatch-get-metric-data'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'xargs-parallel',
      subtopic: 'parallel',
      title: 'Fan out with xargs -P (bounded parallelism)',
      command: `aws ec2 describe-instances --filters Name=tag:Fleet,Values=batch \\
  --query 'Reservations[].Instances[].InstanceId' --output text | tr '\\t' '\\n' |
  xargs -P 8 -I{} sh -c 'aws ec2 modify-instance-metadata-options --instance-id {} --http-tokens required --query InstanceId --output text'`,
      description: 'Sequential loops over hundreds of resources are slow; `xargs -P` runs N commands at once while keeping the total concurrency under the API throttle. Each invocation is independent, so a failure in one does not stop the others.',
      flags: [
        ['tr \'\\t\' \'\\n\'', 'One ID per line so xargs gets one per invocation.'],
        ['-P 8', 'Max parallel processes. 4–10 is a safe range for most APIs; watch for `RequestLimitExceeded`.'],
        ['-I{}', 'Substitute the ID where `{}` appears; implies one argument per command.'],
        ['-r', '(GNU) Do nothing if input is empty.']
      ],
      output: { format: 'plain', body: `i-0123456789abcdef0
i-0fedcba9876543210
i-0a1b2c3d4e5f67890
i-0abcdef1234567890` },
      note: { type: 'gotcha', text: 'Output from parallel jobs interleaves. For anything you need to read afterwards, have each job write its own file (`> out/{}.json`) or use GNU `parallel --keep-order`.' },
      iam: ['ec2:DescribeInstances', 'ec2:ModifyInstanceMetadataOptions'],
      related: ['ec2-imdsv2-audit', 'ec2-imdsv2-enforce', 'cloudwatch-put-retention-policy'],
      tags: ['mutating', 'scripting']
    },
    {
      id: 'compare-table',
      subtopic: 'parallel',
      title: 'Ad-hoc comparison tables for humans',
      command: `aws ec2 describe-instance-types \\
  --instance-types t3.micro t3.small t3.medium m6i.large m7g.large \\
  --query 'sort_by(InstanceTypes,&MemoryInfo.SizeInMiB)[].{Type:InstanceType,vCPU:VCpuInfo.DefaultVCpus,MiB:MemoryInfo.SizeInMiB,Arch:ProcessorInfo.SupportedArchitectures[0],Net:NetworkInfo.NetworkPerformance}' \\
  --output table`,
      description: 'The rule of thumb for output formats: `table` for a human reading a terminal, `text` for a shell pipeline, `json` for another program. Pair table output with a hash projection so the columns have names.',
      flags: [
        ['--instance-types', 'Space-separated list; omit for every type in the region (paginated, slow).'],
        ['sort_by(…,&MemoryInfo.SizeInMiB)', 'Numeric sort works here because the field is a number, not a string.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------
|                      DescribeInstanceTypes                      |
+----------+--------+----------------------+-------------+--------+
|   Arch   |  MiB   |         Net          |     Type    |  vCPU  |
+----------+--------+----------------------+-------------+--------+
|  x86_64  |  1024  |  Up to 5 Gigabit     |  t3.micro   |  2     |
|  x86_64  |  2048  |  Up to 5 Gigabit     |  t3.small   |  2     |
|  x86_64  |  4096  |  Up to 5 Gigabit     |  t3.medium  |  2     |
|  x86_64  |  8192  |  Up to 12.5 Gigabit  |  m6i.large  |  2     |
|  arm64   |  8192  |  Up to 12.5 Gigabit  |  m7g.large  |  2     |
+----------+--------+----------------------+-------------+--------+` },
      iam: ['ec2:DescribeInstanceTypes'],
      related: ['output-query-hash-projection', 'ec2-modify-instance-type'],
      tags: ['read-only', 'query']
    }
  ]
});
