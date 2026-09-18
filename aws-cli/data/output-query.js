/* Topic: Output, --query & Filtering */
AWSCHEAT.register({
  id: 'output-query',
  title: 'Output, --query & Filtering',
  order: 2,
  intro: '`--query` runs a JMESPath expression client-side on the response; `--filters` (where a service supports it) narrows the response server-side. Combine both: filter to reduce what comes back, query to shape it, `--output text` to make it script-friendly.',
  subtopics: [
    { id: 'jmespath', title: 'JMESPath essentials' },
    { id: 'formats', title: 'Output formats' },
    { id: 'pagination', title: 'Pagination' },
    { id: 'wait', title: 'Waiters' }
  ],
  cards: [
    {
      id: 'basics',
      subtopic: 'jmespath',
      title: 'Pick a single value out of a response',
      command: `aws ec2 describe-instances \\
  --instance-ids <instance-id> \\
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \\
  --output text`,
      description: 'Dot navigation plus list indexes walk the JSON to one scalar. With `--output text` the result is the bare value, which is exactly what `$(...)` substitution in a script wants.',
      flags: [
        ['Reservations[0]', 'Index into a list. Negative indexes count from the end (`[-1]`).'],
        ['--output text', 'Scalars print without quotes; `null` prints as `None`.']
      ],
      output: { format: 'text', body: `10.0.1.23` },
      note: { type: 'info', text: 'Keys are case-sensitive and must match the response, not the request: `--instance-ids` on input, `InstanceId` in the output. JMESPath quoting: single quotes around the whole expression for the shell, backticks for literals inside it.' },
      iam: ['ec2:DescribeInstances'],
      related: ['output-query-projections', 'output-query-text-shapes'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'projections',
      subtopic: 'jmespath',
      title: 'List projections: one row per item with chosen fields',
      command: `aws ec2 describe-instances \\
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]' \\
  --output text`,
      description: '`[]` flattens a list and applies what follows to every element. Wrapping fields in `[...]` (a multiselect list) yields one row per instance with the fields in the order you wrote them.',
      flags: [
        ['Reservations[].Instances[]', 'Two flattens in a row collapse the reservation nesting into a flat instance list.'],
        ['[InstanceId,InstanceType,State.Name]', 'Multiselect list: preserves your column order (unlike the hash form, which table output sorts).']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	t3.medium	running
i-0123456789abcdef0	m5.large	running
i-0fedcba9876543210	m5.large	stopped` },
      iam: ['ec2:DescribeInstances'],
      related: ['output-query-hash-projection', 'output-query-filters'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'hash-projection',
      subtopic: 'jmespath',
      title: 'Hash projections: name your columns',
      command: `aws ec2 describe-volumes \\
  --query 'Volumes[].{ID:VolumeId,GiB:Size,Type:VolumeType,State:State,Attached:Attachments[0].InstanceId}'`,
      description: 'A multiselect hash `{Name:expr}` builds a new object per item. It is the right tool for table output (column headers come from your keys) and for JSON you will feed to another program.',
      flags: [
        ['{ID:VolumeId,…}', 'Keys are arbitrary; values are any JMESPath expression relative to the item.'],
        ['Attachments[0].InstanceId', 'Null-safe: a missing element yields `null` rather than an error.']
      ],
      output: { format: 'json', body: `[
    {
        "ID": "vol-0abc123def4567890",
        "GiB": 30,
        "Type": "gp3",
        "State": "in-use",
        "Attached": "i-0abc123def4567890"
    },
    {
        "ID": "vol-0123456789abcdef0",
        "GiB": 100,
        "Type": "gp3",
        "State": "available",
        "Attached": null
    }
]` },
      note: { type: 'gotcha', text: 'With `--output table` the columns are sorted alphabetically by key. Prefix keys with numbers or letters (`1ID`, `2Size`) if you need a specific order in a table.' },
      iam: ['ec2:DescribeVolumes'],
      related: ['output-query-projections', 'ec2-describe-instances-table'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'filters',
      subtopic: 'jmespath',
      title: 'Filter expressions: [?cond] with literals',
      command: `aws ec2 describe-instances \\
  --query 'Reservations[].Instances[?State.Name==\`running\` && InstanceType!=\`t3.micro\`].[InstanceId,InstanceType]' \\
  --output text`,
      description: 'A filter projection keeps items where the condition is true. String literals go in backticks (or `\'…\'` raw string literals), numbers are bare, and you can combine with `&&`, `||` and `!`.',
      flags: [
        ['[?State.Name==`running`]', 'Equality against a JSON literal. Backticks inside single quotes need no escaping from bash.'],
        ['contains(Name, `web`)', 'Substring test. Also `starts_with`, `ends_with`.'],
        ['[?Size > `100`]', 'Numeric comparison; the literal must be a number, not a quoted string.']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	t3.medium
i-0123456789abcdef0	m5.large` },
      note: { type: 'gotcha', text: 'Filtering happens after the full response arrives, so it does not reduce API calls or transfer. When a service offers `--filters`, use it first and reserve `[?…]` for fields the server cannot filter on.' },
      iam: ['ec2:DescribeInstances'],
      related: ['output-query-filters-vs-query', 'output-query-sort'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'sort',
      subtopic: 'jmespath',
      title: 'sort_by, reverse and slices: newest five objects in a bucket',
      command: `aws s3api list-objects-v2 \\
  --bucket <bucket> \\
  --prefix <prefix>/ \\
  --query 'reverse(sort_by(Contents,&LastModified))[:5].[Key,Size,LastModified]' \\
  --output table`,
      description: 'JMESPath functions compose: `sort_by` orders by a field, `reverse` flips it, and a slice `[:5]` takes the first five. This replaces a lot of `| sort | head` piping and works on any list.',
      flags: [
        ['sort_by(Contents,&LastModified)', 'The `&` makes an expression reference; sorting on a timestamp string works because ISO 8601 sorts lexically.'],
        ['[:5]', 'Python-style slice `[start:stop:step]`. `[-3:]` is the last three.'],
        ['--output table', 'Readable grid for humans; switch to text when scripting.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------
|                              ListObjectsV2                               |
+---------------------------------+----------+-----------------------------+
|  logs/2026/09/18/app-14.log.gz  |  184320  |  2026-09-18T14:05:12+00:00  |
|  logs/2026/09/18/app-13.log.gz  |  177211  |  2026-09-18T13:05:09+00:00  |
|  logs/2026/09/18/app-12.log.gz  |  190004  |  2026-09-18T12:05:14+00:00  |
|  logs/2026/09/18/app-11.log.gz  |  171650  |  2026-09-18T11:05:10+00:00  |
|  logs/2026/09/18/app-10.log.gz  |  183902  |  2026-09-18T10:05:11+00:00  |
+---------------------------------+----------+-----------------------------+` },
      iam: ['s3:ListBucket'],
      related: ['output-query-length', 's3-largest-objects'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'length',
      subtopic: 'jmespath',
      title: 'Count things with length()',
      command: `aws ec2 describe-instances \\
  --filters Name=instance-state-name,Values=running \\
  --query 'length(Reservations[].Instances[])' \\
  --output text`,
      description: 'Counting client-side avoids `| wc -l` off-by-one mistakes and works on nested lists after flattening. Any JMESPath function can wrap the whole expression.',
      flags: [
        ['length(…)', 'Works on lists, strings and objects.'],
        ['max_by / min_by / sum / avg', 'Other useful aggregates: `max_by(Volumes,&Size).Size`, `sum(Volumes[].Size)`.']
      ],
      output: { format: 'text', body: `2` },
      iam: ['ec2:DescribeInstances'],
      related: ['output-query-sort', 'scripting-loop-regions'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'pipes-functions',
      subtopic: 'jmespath',
      title: 'Pipes, join and to_string for shaping output',
      command: `aws iam list-users \\
  --query "Users[?contains(UserName,'svc-')].UserName | join(', ', @)" \\
  --output text`,
      description: 'A pipe `|` stops projection and hands the whole left-hand result to the right-hand expression. `@` is the current value. Here the filtered list of names becomes one comma-separated string.',
      flags: [
        ['|', 'Pipe: evaluate the right side once on the entire left result rather than per element.'],
        ['join(\', \', @)', 'Concatenate a list of strings.'],
        ['to_string(@) / to_number(@)', 'Type coercion when a field is stored as a string but you need numeric comparison.']
      ],
      output: { format: 'text', body: `svc-backup, svc-ci, svc-metrics` },
      note: { type: 'info', text: 'Double quotes around the expression let you use single-quoted raw string literals inside (`\'svc-\'`), an alternative to backticks that reads better for plain strings.' },
      iam: ['iam:ListUsers'],
      related: ['output-query-filters', 'iam-list-users'],
      tags: ['read-only', 'query', 'jmespath']
    },
    {
      id: 'filters-vs-query',
      subtopic: 'jmespath',
      title: '--filters (server-side) vs --query (client-side)',
      command: `aws ec2 describe-volumes \\
  --filters Name=volume-type,Values=gp2 Name=status,Values=in-use \\
  --query 'Volumes[?Size>\`100\`].{ID:VolumeId,GiB:Size,Instance:Attachments[0].InstanceId}'`,
      description: '`--filters` are sent to the API, so AWS only returns matching gp2 volumes; `--query` then applies a size test the API cannot express. Server-side first keeps responses small and avoids pagination surprises.',
      flags: [
        ['--filters Name=…,Values=…', 'Repeatable; multiple `Name=` entries are ANDed, multiple `Values` within one are ORed. Wildcards `*` and `?` are allowed in values.'],
        ['--query', 'Runs after all pages are fetched and merged.']
      ],
      output: { format: 'json', body: `[
    {
        "ID": "vol-0fedcba9876543210",
        "GiB": 500,
        "Instance": "i-0123456789abcdef0"
    }
]` },
      note: { type: 'gotcha', text: 'Filter names are service-specific and use hyphenated lower-case (`volume-type`, `tag:Name`), not the CamelCase field names in the output. `aws ec2 describe-volumes help` lists every filter.' },
      iam: ['ec2:DescribeVolumes'],
      related: ['output-query-filters', 'ec2-describe-instances-by-tag'],
      tags: ['read-only', 'query']
    },
    {
      id: 'text-shapes',
      subtopic: 'formats',
      title: 'How --output text lays out nested structures',
      command: `aws ec2 describe-vpcs --output text`,
      description: 'Without `--query`, text output prints one line per object, prefixed with the upper-cased key name, and nested lists get their own prefixed lines. That is rarely what you want; combine text output with a `--query` that yields a flat list of scalars or lists.',
      flags: [
        ['--output text', 'Tab-separated, no quoting, booleans as `True`/`False`, nulls as `None`.'],
        ['Tip', 'Use `--query` so each line is exactly the columns you need; then `cut -f`, `awk` or `read -r a b c` parse it reliably.']
      ],
      output: { format: 'text', body: `VPCS	10.0.0.0/16	dopt-0a1b2c3d4e5f67890	default	False	123456789012	available	vpc-0a1b2c3d
CIDRBLOCKASSOCIATIONSET	vpc-cidr-assoc-0abc123def4567890	10.0.0.0/16
CIDRBLOCKSTATE	associated
TAGS	Name	main` },
      iam: ['ec2:DescribeVpcs'],
      related: ['output-query-projections', 'scripting-jq-vs-query'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'yaml',
      subtopic: 'formats',
      title: 'YAML output for reading long responses',
      command: `aws ssm describe-parameters --output yaml`,
      description: 'YAML is denser than JSON and easier to skim for deeply nested responses. `yaml-stream` emits each page as it arrives, which is useful for very large paginated results.',
      flags: [
        ['--output yaml', 'Whole response as a YAML document.'],
        ['--output yaml-stream', 'One document per page, separated by `---`, streamed as pages arrive.']
      ],
      output: { format: 'yaml', body: `Parameters:
- ARN: arn:aws:ssm:us-east-1:123456789012:parameter/prod/db/password
  DataType: text
  LastModifiedDate: '2026-08-30T10:12:44.318000+00:00'
  LastModifiedUser: arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice
  Name: /prod/db/password
  Tier: Standard
  Type: SecureString
  Version: 3
- ARN: arn:aws:ssm:us-east-1:123456789012:parameter/prod/db/host
  DataType: text
  LastModifiedDate: '2026-08-30T10:11:02.001000+00:00'
  LastModifiedUser: arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice
  Name: /prod/db/host
  Tier: Standard
  Type: String
  Version: 1` },
      iam: ['ssm:DescribeParameters'],
      related: ['output-query-text-shapes', 'ssm-get-parameters-by-path'],
      tags: ['read-only']
    },
    {
      id: 'max-items',
      subtopic: 'pagination',
      title: 'Limit results and resume with --max-items / --starting-token',
      command: `aws s3api list-objects-v2 --bucket <bucket> --max-items 2
# continue where it stopped:
aws s3api list-objects-v2 --bucket <bucket> --max-items 2 --starting-token <next-token>`,
      description: 'The CLI paginates automatically and merges all pages, so a bare list call can run for minutes on a huge bucket. `--max-items` caps the total returned and hands back a `NextToken` you can pass to `--starting-token` to continue.',
      flags: [
        ['--max-items', 'Client-side cap on total items across pages. Not the same as the API page size.'],
        ['--starting-token', 'Opaque token from the previous response\'s `NextToken` field.'],
        ['--page-size', 'How many items to request per API call (see the next card).']
      ],
      output: { format: 'json', body: `{
    "Contents": [
        {
            "Key": "logs/2026/09/18/app-10.log.gz",
            "LastModified": "2026-09-18T10:05:11+00:00",
            "ETag": "\\"9b2cf535f27731c974343645a3985328\\"",
            "Size": 183902,
            "StorageClass": "STANDARD"
        },
        {
            "Key": "logs/2026/09/18/app-11.log.gz",
            "LastModified": "2026-09-18T11:05:10+00:00",
            "ETag": "\\"d41d8cd98f00b204e9800998ecf8427e\\"",
            "Size": 171650,
            "StorageClass": "STANDARD"
        }
    ],
    "NextToken": "eyJDb250aW51YXRpb25Ub2tlbiI6IG51bGwsICJib3RvX3RydW5jYXRlX2Ftb3VudCI6IDJ9"
}` },
      note: { type: 'gotcha', text: 'The `NextToken` the CLI prints is a CLI-generated token, not the service\'s raw continuation token. Only feed it back to the CLI via `--starting-token`.' },
      iam: ['s3:ListBucket'],
      related: ['output-query-page-size', 'output-query-no-paginate'],
      tags: ['read-only', 'pagination']
    },
    {
      id: 'page-size',
      subtopic: 'pagination',
      title: 'Tune API page size to avoid throttling or timeouts',
      command: `aws s3api list-objects-v2 --bucket <bucket> --page-size 100 --max-items 1000 --query 'Contents[].Key' --output text`,
      description: '`--page-size` controls how many items each underlying API call asks for; the CLI still fetches every page (up to `--max-items`). Smaller pages reduce per-call latency and timeouts; larger pages reduce call count and throttling.',
      flags: [
        ['--page-size', 'Per-request limit passed to the API (`MaxKeys` here). Service maximums apply (1000 for S3).'],
        ['--max-items', 'Overall cap; without it you get everything.']
      ],
      output: { format: 'text', body: `logs/2026/09/18/app-10.log.gz	logs/2026/09/18/app-11.log.gz	logs/2026/09/18/app-12.log.gz	logs/2026/09/18/app-13.log.gz` },
      iam: ['s3:ListBucket'],
      related: ['output-query-max-items', 'output-query-no-paginate'],
      tags: ['read-only', 'pagination']
    },
    {
      id: 'no-paginate',
      subtopic: 'pagination',
      title: 'Disable auto-pagination to get a single raw page',
      command: `aws ec2 describe-snapshots --owner-ids self --max-results 5 --no-paginate`,
      description: 'With `--no-paginate` the CLI makes exactly one API call and returns that page, including the service\'s own `NextToken`. Use it when writing your own pagination loop or when you only need to know whether anything exists.',
      flags: [
        ['--no-paginate', 'One request, one page, no merging.'],
        ['--max-results', 'The service\'s own page-size parameter (name varies: `--max-results`, `--max-keys`, `--limit`). With auto-pagination on, this is overridden by `--page-size`.']
      ],
      output: { format: 'json', body: `{
    "Snapshots": [
        {
            "Description": "nightly web-1 root",
            "Encrypted": true,
            "OwnerId": "123456789012",
            "Progress": "100%",
            "SnapshotId": "snap-0fedcba9876543210",
            "StartTime": "2026-09-17T02:00:03.541000+00:00",
            "State": "completed",
            "VolumeId": "vol-0abc123def4567890",
            "VolumeSize": 30,
            "StorageTier": "standard"
        }
    ],
    "NextToken": "AAAAAY2JhYzEyMy1kZWY0LTU2Ny04OTBhYmNkZWYxMjM0NTY3ODk="
}` },
      iam: ['ec2:DescribeSnapshots'],
      related: ['output-query-max-items', 'output-query-page-size'],
      tags: ['read-only', 'pagination']
    },
    {
      id: 'waiters',
      subtopic: 'wait',
      title: 'Block until a resource reaches a state',
      command: `aws ec2 wait instance-running --instance-ids <instance-id> && echo "up"
aws cloudformation wait stack-update-complete --stack-name <stack-name>
aws rds wait db-instance-available --db-instance-identifier <db-instance-id>`,
      description: 'Waiters poll a describe call until the condition holds or the attempt limit is reached, then exit 0 or 255. They replace hand-written sleep loops in deployment scripts. `aws <service> wait help` lists what each service offers.',
      flags: [
        ['aws <service> wait <name>', 'Each waiter has a fixed poll interval and max attempts (e.g. instance-running: 15 s × 40).'],
        ['exit 255', 'Returned when the waiter times out or the resource enters a failure state; check `$?`.'],
        ['--cli-read-timeout 0', '(optional) Disable the socket read timeout for long-running waits behind slow proxies.']
      ],
      output: { format: 'plain', body: `up` },
      note: { type: 'gotcha', text: 'Waiters use the same `--filters`/`--query`-free describe call, so they need the corresponding `Describe*` permission. A waiter that fails immediately with `Waiter … failed: Max attempts exceeded` after ~0 seconds usually means the ID is wrong, not that it timed out.' },
      iam: ['ec2:DescribeInstances', 'cloudformation:DescribeStacks', 'rds:DescribeDBInstances'],
      related: ['ec2-start-instances', 'cloudformation-deploy', 'scripting-exit-codes'],
      tags: ['read-only', 'waiter', 'scripting']
    }
  ]
});
