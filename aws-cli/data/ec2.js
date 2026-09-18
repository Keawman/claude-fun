/* Topic: EC2 */
AWSCHEAT.register({
  id: 'ec2',
  title: 'EC2',
  order: 5,
  intro: 'Instances, images, storage, security groups and key pairs. Most EC2 describe calls return deeply nested JSON, so almost every read-only card here pairs the command with a `--query` that flattens it into something you can actually scan.',
  subtopics: [
    { id: 'instances', title: 'Instances' },
    { id: 'attributes', title: 'Attributes & IMDSv2' },
    { id: 'tags', title: 'Tags' },
    { id: 'images', title: 'AMIs' },
    { id: 'storage', title: 'Volumes & snapshots' },
    { id: 'security-groups', title: 'Security groups' },
    { id: 'key-pairs', title: 'Key pairs' }
  ],
  cards: [
    {
      id: 'describe-instances-table',
      subtopic: 'instances',
      title: 'List instances as a table (ID, name, type, state, IP)',
      command: `aws ec2 describe-instances \\
  --query 'Reservations[].Instances[].{ID:InstanceId,Name:Tags[?Key==\`Name\`]|[0].Value,Type:InstanceType,State:State.Name,IP:PrivateIpAddress}' \\
  --output table`,
      description: 'The everyday inventory view. The hash-projection `{Key:expr}` picks named columns out of the nested Reservations/Instances structure, and table output sorts those columns alphabetically by key.',
      flags: [
        ['--query', 'JMESPath expression. `Reservations[].Instances[]` flattens the two-level nesting; `Tags[?Key==`Name`]|[0].Value` pulls the Name tag or null.'],
        ['--output table', 'ASCII table. Column order is alphabetical by key, so name your keys accordingly if you care about order.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------------------
|                             DescribeInstances                              |
+-----------------------+-------------+------------+-----------+-------------+
|           ID          |      IP     |    Name    |   State   |     Type    |
+-----------------------+-------------+------------+-----------+-------------+
|  i-0abc123def4567890  |  10.0.1.23  |  web-1     |  running  |  t3.medium  |
|  i-0123456789abcdef0  |  10.0.2.45  |  worker-1  |  running  |  m5.large   |
|  i-0fedcba9876543210  |  10.0.2.46  |  worker-2  |  stopped  |  m5.large   |
+-----------------------+-------------+------------+-----------+-------------+` },
      note: { type: 'info', text: 'Instances with no Name tag show `None` in the column. Add `--filters Name=instance-state-name,Values=running` to hide stopped and terminated instances.' },
      iam: ['ec2:DescribeInstances'],
      related: ['ec2-describe-instances-by-tag', 'output-query-hash-projection'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-instances-by-tag',
      subtopic: 'instances',
      title: 'Get instance IDs matching a tag, ready for scripting',
      command: `aws ec2 describe-instances \\
  --filters "Name=tag:Environment,Values=prod" "Name=instance-state-name,Values=running" \\
  --query 'Reservations[].Instances[].InstanceId' \\
  --output text`,
      description: 'Server-side filtering with `--filters` narrows the API response before it leaves AWS, then `--output text` emits bare IDs separated by tabs so you can feed them straight into another command or a shell loop.',
      flags: [
        ['--filters', 'Server-side filters. `tag:<key>` matches a tag key; `Values` accepts wildcards (`prod-*`) and multiple comma-separated values (OR).'],
        ['--output text', 'Tab-separated values with no quoting. A list of scalars comes out on one line.']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	i-0123456789abcdef0	i-0a1b2c3d4e5f67890` },
      note: { type: 'gotcha', text: 'Filter names are case-sensitive and the tag filter is `tag:Environment`, not `tag-key`. Use `Name=tag-key,Values=Environment` when you only care that the key exists.' },
      iam: ['ec2:DescribeInstances'],
      related: ['ec2-stop-instances', 'scripting-loop-instances'],
      tags: ['read-only', 'query', 'scripting']
    },
    {
      id: 'describe-instance-status',
      subtopic: 'instances',
      title: 'Check status checks and scheduled maintenance events',
      command: `aws ec2 describe-instance-status \\
  --instance-ids <instance-id> \\
  --include-all-instances`,
      description: 'Shows the system and instance reachability checks plus any scheduled events (retirement, reboot, system maintenance). Run this first when an instance is up but unreachable.',
      flags: [
        ['--include-all-instances', 'Also return instances that are not `running`. Without it, stopped instances are silently omitted.'],
        ['--instance-ids', 'One or more IDs separated by spaces. Omit to get every instance in the region.']
      ],
      output: { format: 'json', body: `{
    "InstanceStatuses": [
        {
            "AvailabilityZone": "us-east-1a",
            "Events": [
                {
                    "InstanceEventId": "instance-event-0d59937288b749b32",
                    "Code": "system-reboot",
                    "Description": "scheduled reboot",
                    "NotBefore": "2026-09-22T09:00:00+00:00",
                    "NotAfter": "2026-09-22T11:00:00+00:00"
                }
            ],
            "InstanceId": "i-0abc123def4567890",
            "InstanceState": {
                "Code": 16,
                "Name": "running"
            },
            "InstanceStatus": {
                "Details": [
                    {
                        "Name": "reachability",
                        "Status": "passed"
                    }
                ],
                "Status": "ok"
            },
            "SystemStatus": {
                "Details": [
                    {
                        "Name": "reachability",
                        "Status": "passed"
                    }
                ],
                "Status": "ok"
            }
        }
    ]
}` },
      note: { type: 'info', text: 'To list only instances with pending events across the region: `--query "InstanceStatuses[?length(Events)>\\`0\\`].[InstanceId,Events[0].Code,Events[0].NotBefore]" --output text`.' },
      iam: ['ec2:DescribeInstanceStatus'],
      related: ['ec2-describe-instances-table', 'ec2-get-console-output'],
      tags: ['read-only']
    },
    {
      id: 'run-instances',
      subtopic: 'instances',
      title: 'Launch an instance with a Name tag',
      command: `aws ec2 run-instances \\
  --image-id <ami-id> \\
  --instance-type t3.micro \\
  --subnet-id <subnet-id> \\
  --security-group-ids <sg-id> \\
  --key-name <key-name> \\
  --iam-instance-profile Name=<instance-profile-name> \\
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \\
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1},{Key=Environment,Value=prod}]' \\
  --query 'Instances[].{ID:InstanceId,State:State.Name,AZ:Placement.AvailabilityZone}'`,
      description: 'A minimal but production-shaped launch: explicit subnet and security group, an instance profile instead of static keys, IMDSv2 enforced from birth, and tags applied atomically at creation.',
      flags: [
        ['--tag-specifications', 'Tags applied at launch. Repeat the block with `ResourceType=volume` to tag the root volume too.'],
        ['--metadata-options HttpTokens=required', 'Enforces IMDSv2 so credential-stealing SSRF attacks cannot hit the metadata service with a plain GET.'],
        ['--iam-instance-profile Name=…', 'Attach a role via its instance profile. Use `Arn=` instead of `Name=` for cross-account profiles.'],
        ['--count 3', '(not shown) Launch several identical instances. `--count 1:5` means at least 1, up to 5.'],
        ['--dry-run', '(not shown) Validate permissions and parameters without launching. Success is reported as a `DryRunOperation` error.']
      ],
      output: { format: 'json', body: `[
    {
        "ID": "i-0abc123def4567890",
        "State": "pending",
        "AZ": "us-east-1a"
    }
]` },
      note: { type: 'gotcha', text: 'Without `--associate-public-ip-address` the subnet default decides whether the instance gets a public IP. Tag specifications need the full `ResourceType=instance,Tags=[...]` shape; `--tags` is not a valid option on run-instances.' },
      iam: ['ec2:RunInstances', 'ec2:CreateTags', 'iam:PassRole'],
      related: ['ec2-ami-latest-al2023', 'ec2-imdsv2-enforce', 'scripting-dry-run'],
      tags: ['mutating']
    },
    {
      id: 'start-instances',
      subtopic: 'instances',
      title: 'Start stopped instances',
      command: `aws ec2 start-instances --instance-ids <instance-id> <instance-id-2>`,
      description: 'Starts one or more stopped instances. The response reports the transition; pair it with `aws ec2 wait instance-running` when a script needs the instance to be up.',
      flags: [
        ['--instance-ids', 'Space-separated list. Every ID must exist or the whole call fails with `InvalidInstanceID.NotFound`.']
      ],
      output: { format: 'json', body: `{
    "StartingInstances": [
        {
            "InstanceId": "i-0abc123def4567890",
            "CurrentState": {
                "Code": 0,
                "Name": "pending"
            },
            "PreviousState": {
                "Code": 80,
                "Name": "stopped"
            }
        },
        {
            "InstanceId": "i-0123456789abcdef0",
            "CurrentState": {
                "Code": 0,
                "Name": "pending"
            },
            "PreviousState": {
                "Code": 80,
                "Name": "stopped"
            }
        }
    ]
}` },
      iam: ['ec2:StartInstances'],
      related: ['ec2-stop-instances', 'output-query-waiters'],
      tags: ['mutating']
    },
    {
      id: 'stop-instances',
      subtopic: 'instances',
      title: 'Stop instances (optionally force or hibernate)',
      command: `aws ec2 stop-instances --instance-ids <instance-id>`,
      description: 'Graceful OS shutdown followed by stop; EBS volumes persist and you stop paying for compute. Public IPv4 addresses that are not Elastic IPs are released.',
      flags: [
        ['--force', '(optional) Skip the graceful shutdown. Use when the OS is hung; risks filesystem corruption.'],
        ['--hibernate', '(optional) Save RAM to the root volume instead of shutting down. Requires an instance launched with hibernation enabled.']
      ],
      output: { format: 'json', body: `{
    "StoppingInstances": [
        {
            "InstanceId": "i-0abc123def4567890",
            "CurrentState": {
                "Code": 64,
                "Name": "stopping"
            },
            "PreviousState": {
                "Code": 16,
                "Name": "running"
            }
        }
    ]
}` },
      note: { type: 'gotcha', text: 'Instance-store volumes lose their data on stop. Stopping is also how you change the instance type: stop, `modify-instance-attribute`, start.' },
      iam: ['ec2:StopInstances'],
      related: ['ec2-start-instances', 'ec2-modify-instance-type'],
      tags: ['mutating']
    },
    {
      id: 'reboot-instances',
      subtopic: 'instances',
      title: 'Reboot an instance',
      command: `aws ec2 reboot-instances --instance-ids <instance-id>`,
      description: 'Sends an OS-level reboot. The instance keeps its host, IPs and instance-store data. If the instance does not cleanly reboot within four minutes, EC2 performs a hard reset.',
      flags: [],
      output: { format: 'none', body: '' },
      note: { type: 'info', text: 'Reboot never changes the underlying host. To move off degraded hardware you must stop and start.' },
      iam: ['ec2:RebootInstances'],
      related: ['ec2-stop-instances', 'ec2-get-console-output'],
      tags: ['mutating']
    },
    {
      id: 'terminate-instances',
      subtopic: 'instances',
      title: 'Terminate instances permanently',
      command: `aws ec2 terminate-instances --instance-ids <instance-id>`,
      description: 'Deletes the instance. Root volumes with DeleteOnTermination=true (the default) are destroyed too. There is no undo.',
      flags: [
        ['--dry-run', '(optional) Check that you are allowed to terminate without doing it.']
      ],
      output: { format: 'json', body: `{
    "TerminatingInstances": [
        {
            "InstanceId": "i-0abc123def4567890",
            "CurrentState": {
                "Code": 32,
                "Name": "shutting-down"
            },
            "PreviousState": {
                "Code": 16,
                "Name": "running"
            }
        }
    ]
}` },
      note: { type: 'danger', text: 'If termination protection is on you get `OperationNotPermitted`. That is the guard rail working; remove it deliberately with `modify-instance-attribute --no-disable-api-termination` rather than reflexively.' },
      iam: ['ec2:TerminateInstances'],
      related: ['ec2-termination-protection', 'scripting-dry-run'],
      tags: ['destructive']
    },
    {
      id: 'get-console-output',
      subtopic: 'instances',
      title: 'Read the serial console (boot log) of an instance',
      command: `aws ec2 get-console-output \\
  --instance-id <instance-id> \\
  --latest \\
  --query Output \\
  --output text`,
      description: 'Returns the kernel and init output captured from the serial console. This is the only way to see why an instance fails a status check when you cannot SSH or SSM in.',
      flags: [
        ['--latest', 'Fetch the most recent output instead of the buffer captured at last boot. Only supported on Nitro instances.'],
        ['--query Output --output text', 'Strip the JSON envelope and print the raw log with newlines intact.']
      ],
      output: { format: 'plain', body: `[    0.000000] Linux version 6.1.102-108.177.amzn2023.x86_64 (mockbuild@ip-10-0-40-38) (gcc (GCC) 11.4.1 20230605 (Red Hat 11.4.1-2), GNU ld version 2.39-6.amzn2023.0.10) #1 SMP PREEMPT_DYNAMIC Thu Aug 15 02:44:38 UTC 2024
[    0.000000] Command line: BOOT_IMAGE=(hd0,gpt1)/boot/vmlinuz-6.1.102-108.177.amzn2023.x86_64 root=UUID=1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d ro console=tty0 console=ttyS0,115200n8 nvme_core.io_timeout=4294967295
[    1.043212] EXT4-fs (nvme0n1p1): mounted filesystem with ordered data mode.
[    2.310445] cloud-init[1234]: Cloud-init v. 22.2.2 running 'init' at Wed, 16 Sep 2026 14:02:11 +0000.
[  OK  ] Started Cloud-init final stage.
[  OK  ] Reached target Cloud-init target.

Amazon Linux 2023
Kernel 6.1.102-108.177.amzn2023.x86_64 on an x86_64 (-)

ip-10-0-1-23 login:` },
      note: { type: 'gotcha', text: 'Output is only posted at boot and, on Nitro, on demand. If the log is empty, the instance may not have written anything to the serial console yet; wait a minute and retry with `--latest`.' },
      iam: ['ec2:GetConsoleOutput'],
      related: ['ec2-describe-instance-status', 'ssm-start-session'],
      tags: ['read-only']
    },
    {
      id: 'modify-instance-type',
      subtopic: 'attributes',
      title: 'Change the instance type (resize)',
      command: `aws ec2 stop-instances --instance-ids <instance-id> \\
  && aws ec2 wait instance-stopped --instance-ids <instance-id> \\
  && aws ec2 modify-instance-attribute --instance-id <instance-id> --instance-type Value=m5.large \\
  && aws ec2 start-instances --instance-ids <instance-id>`,
      description: 'Resizing requires a stopped instance. Chaining with `&&` means each step only runs if the previous one succeeded, and the waiter blocks until the stop completes.',
      flags: [
        ['--instance-type Value=…', 'Shorthand syntax for the attribute value structure. `Value=` is mandatory.'],
        ['aws ec2 wait instance-stopped', 'Polls every 15 s for up to 40 attempts, exiting non-zero on timeout.']
      ],
      output: { format: 'json', body: `{
    "StoppingInstances": [
        {
            "InstanceId": "i-0abc123def4567890",
            "CurrentState": {
                "Code": 64,
                "Name": "stopping"
            },
            "PreviousState": {
                "Code": 16,
                "Name": "running"
            }
        }
    ]
}
{
    "StartingInstances": [
        {
            "InstanceId": "i-0abc123def4567890",
            "CurrentState": {
                "Code": 0,
                "Name": "pending"
            },
            "PreviousState": {
                "Code": 80,
                "Name": "stopped"
            }
        }
    ]
}` },
      note: { type: 'gotcha', text: 'Changing between virtualisation families (e.g. to Graviton `m7g`) requires a matching-architecture AMI; the attribute call succeeds but the instance will not boot.' },
      iam: ['ec2:StopInstances', 'ec2:ModifyInstanceAttribute', 'ec2:StartInstances', 'ec2:DescribeInstances'],
      related: ['ec2-stop-instances', 'output-query-waiters'],
      tags: ['mutating', 'waiter']
    },
    {
      id: 'termination-protection',
      subtopic: 'attributes',
      title: 'Enable termination protection and verify it',
      command: `aws ec2 modify-instance-attribute --instance-id <instance-id> --disable-api-termination \\
  && aws ec2 describe-instance-attribute --instance-id <instance-id> --attribute disableApiTermination`,
      description: 'Blocks `terminate-instances` from the API and console until the flag is cleared. Cheap insurance for stateful hosts. Turn it off with `--no-disable-api-termination`.',
      flags: [
        ['--disable-api-termination', 'Boolean flag: sets the attribute to true. The negated form `--no-disable-api-termination` sets it false.'],
        ['--attribute disableApiTermination', 'describe-instance-attribute returns exactly one attribute per call; the name is camelCase here.']
      ],
      output: { format: 'json', body: `{
    "InstanceId": "i-0abc123def4567890",
    "DisableApiTermination": {
        "Value": true
    }
}` },
      note: { type: 'info', text: 'Termination protection does not stop Auto Scaling or Spot interruptions from terminating an instance, and it does not protect against `shutdown -h` inside the OS when the shutdown behaviour is `terminate`.' },
      iam: ['ec2:ModifyInstanceAttribute', 'ec2:DescribeInstanceAttribute'],
      related: ['ec2-terminate-instances'],
      tags: ['mutating', 'security']
    },
    {
      id: 'imdsv2-enforce',
      subtopic: 'attributes',
      title: 'Enforce IMDSv2 on a running instance',
      command: `aws ec2 modify-instance-metadata-options \\
  --instance-id <instance-id> \\
  --http-tokens required \\
  --http-endpoint enabled \\
  --http-put-response-hop-limit 1`,
      description: 'Requires the session-token flow for the instance metadata service, closing the classic SSRF path to instance credentials. Applies immediately, no reboot needed.',
      flags: [
        ['--http-tokens required', '`optional` allows IMDSv1 and v2; `required` allows only v2.'],
        ['--http-put-response-hop-limit 1', 'TTL of the token response. Set to 2 if containers on the host need IMDS access through a NAT hop.'],
        ['--http-endpoint enabled', 'Set to `disabled` to turn IMDS off entirely (breaks most agents and SDK credential lookup).']
      ],
      output: { format: 'json', body: `{
    "InstanceId": "i-0abc123def4567890",
    "InstanceMetadataOptions": {
        "State": "pending",
        "HttpTokens": "required",
        "HttpPutResponseHopLimit": 1,
        "HttpEndpoint": "enabled",
        "HttpProtocolIpv6": "disabled",
        "InstanceMetadataTags": "disabled"
    }
}` },
      note: { type: 'gotcha', text: 'Old SDKs and hand-rolled `curl http://169.254.169.254/latest/meta-data/` scripts break the moment you require tokens. Check CloudWatch metric `MetadataNoToken` for the instance first: non-zero means something still uses IMDSv1.' },
      iam: ['ec2:ModifyInstanceMetadataOptions'],
      related: ['ec2-imdsv2-audit', 'ec2-run-instances'],
      tags: ['mutating', 'security']
    },
    {
      id: 'imdsv2-audit',
      subtopic: 'attributes',
      title: 'Find instances that still allow IMDSv1',
      command: `aws ec2 describe-instances \\
  --query 'Reservations[].Instances[?MetadataOptions.HttpTokens==\`optional\`].[InstanceId,Tags[?Key==\`Name\`]|[0].Value,MetadataOptions.HttpTokens]' \\
  --output text`,
      description: 'A quick compliance sweep. The JMESPath filter runs client-side on the full describe response, so no server-side filter is needed.',
      flags: [
        ['[?MetadataOptions.HttpTokens==`optional`]', 'Filter projection: keep instances whose token mode is optional (IMDSv1 allowed).'],
        ['--output text', 'One instance per line, tab-separated, for piping into `xargs -n1 aws ec2 modify-instance-metadata-options …`.']
      ],
      output: { format: 'text', body: `i-0123456789abcdef0	worker-1	optional
i-0fedcba9876543210	worker-2	optional` },
      iam: ['ec2:DescribeInstances'],
      related: ['ec2-imdsv2-enforce', 'scripting-xargs-parallel'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'create-tags',
      subtopic: 'tags',
      title: 'Add or overwrite tags on any EC2 resource',
      command: `aws ec2 create-tags \\
  --resources <instance-id> <volume-id> \\
  --tags Key=Owner,Value=alice Key=CostCenter,Value=1234`,
      description: 'Works on instances, volumes, snapshots, AMIs, security groups, VPC objects and more in a single call. Existing keys are overwritten; other tags are untouched.',
      flags: [
        ['--resources', 'Any mix of EC2 resource IDs (up to 1000).'],
        ['--tags Key=…,Value=…', 'Shorthand list. Values with spaces need quoting: `"Key=Name,Value=web server 1"`.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'info', text: 'Tag values are limited to 256 characters and keys prefixed `aws:` are reserved. For non-EC2 services (S3, Lambda, RDS) each service has its own tagging command, or use `aws resourcegroupstaggingapi tag-resources`.' },
      iam: ['ec2:CreateTags'],
      related: ['ec2-delete-tags', 'ec2-describe-instances-by-tag'],
      tags: ['mutating']
    },
    {
      id: 'delete-tags',
      subtopic: 'tags',
      title: 'Remove a tag key (regardless of value)',
      command: `aws ec2 delete-tags --resources <instance-id> --tags Key=Temp`,
      description: 'Deletes the tag with that key from each resource. Omitting `Value` removes the key whatever its value; including `Value=x` only removes it when the value matches exactly.',
      flags: [
        ['--tags Key=Temp', 'Key-only form: remove the tag no matter its value.'],
        ['--tags Key=Temp,Value=yes', 'Conditional form: remove only if the value is `yes`.']
      ],
      output: { format: 'none', body: '' },
      iam: ['ec2:DeleteTags'],
      related: ['ec2-create-tags'],
      tags: ['mutating']
    },
    {
      id: 'ami-latest-al2023',
      subtopic: 'images',
      title: 'Look up the latest Amazon Linux 2023 AMI ID',
      command: `aws ssm get-parameter \\
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \\
  --query Parameter.Value \\
  --output text`,
      description: 'AWS publishes current AMI IDs as public SSM parameters, so you never hard-code an AMI that goes stale. Change the path for arm64 (`al2023-ami-kernel-default-arm64`) or Amazon Linux 2 (`amzn2-ami-hvm-x86_64-gp2`).',
      flags: [
        ['--name', 'Public parameter path. `aws ssm get-parameters-by-path --path /aws/service/ami-amazon-linux-latest` lists every variant.'],
        ['--query Parameter.Value --output text', 'Print only the AMI ID for use in `$(...)` substitution.']
      ],
      output: { format: 'text', body: `ami-0abcdef1234567890` },
      note: { type: 'info', text: 'Windows and other distros publish similar paths, for example `/aws/service/ami-windows-latest/Windows_Server-2022-English-Full-Base` and `/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id`.' },
      iam: ['ssm:GetParameter'],
      related: ['ec2-run-instances', 'ec2-describe-images-own'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'describe-images-own',
      subtopic: 'images',
      title: 'List your own AMIs, newest last',
      command: `aws ec2 describe-images \\
  --owners self \\
  --query 'sort_by(Images,&CreationDate)[].{ID:ImageId,Name:Name,Created:CreationDate,State:State}' \\
  --output table`,
      description: 'Without `--owners` this call would return every public AMI in the region (tens of thousands). `sort_by` orders client-side so the newest image ends up at the bottom of the table.',
      flags: [
        ['--owners self', 'Only images owned by the calling account. Accepts account IDs and the aliases `amazon` and `aws-marketplace`.'],
        ['sort_by(Images,&CreationDate)', 'JMESPath sort. The `&` marks an expression reference; strings sort lexically, which works for ISO timestamps.'],
        ['--filters Name=name,Values=web-*', '(optional) Server-side wildcard match on the AMI name.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------------
|                                       DescribeImages                                       |
+----------------------------+-------------------------+-----------------------+-------------+
|          Created           |            ID           |          Name         |    State    |
+----------------------------+-------------------------+-----------------------+-------------+
|  2026-08-02T03:11:40.000Z  |  ami-0123456789abcdef0  |  web-base-2026-08-02  |  available  |
|  2026-09-01T03:10:58.000Z  |  ami-0fedcba9876543210  |  web-base-2026-09-01  |  available  |
|  2026-09-15T03:12:07.000Z  |  ami-0abcdef1234567890  |  web-base-2026-09-15  |  available  |
+----------------------------+-------------------------+-----------------------+-------------+` },
      iam: ['ec2:DescribeImages'],
      related: ['ec2-create-image', 'ec2-deregister-image'],
      tags: ['read-only', 'query']
    },
    {
      id: 'create-image',
      subtopic: 'images',
      title: 'Create an AMI from a running instance',
      command: `aws ec2 create-image \\
  --instance-id <instance-id> \\
  --name "web-base-$(date +%Y-%m-%d)" \\
  --description "Golden image from web-1" \\
  --no-reboot \\
  --tag-specifications 'ResourceType=image,Tags=[{Key=Source,Value=web-1}]' 'ResourceType=snapshot,Tags=[{Key=Source,Value=web-1}]'`,
      description: 'Snapshots every attached EBS volume and registers an AMI. The image is `pending` until the snapshots complete; poll with `aws ec2 wait image-available --image-ids <ami-id>`.',
      flags: [
        ['--no-reboot', 'Do not stop the instance to flush disks. Faster and non-disruptive, but the filesystem may be crash-consistent rather than application-consistent.'],
        ['--tag-specifications', 'Tag the AMI and its snapshots at creation. Snapshots are otherwise untagged and hard to trace later.'],
        ['--name', 'Must be unique per account and region; 3–128 characters.']
      ],
      output: { format: 'json', body: `{
    "ImageId": "ami-0abcdef1234567890"
}` },
      iam: ['ec2:CreateImage', 'ec2:CreateTags'],
      related: ['ec2-describe-images-own', 'ec2-deregister-image', 'ec2-create-snapshot'],
      tags: ['mutating']
    },
    {
      id: 'deregister-image',
      subtopic: 'images',
      title: 'Deregister an AMI and delete its backing snapshots',
      command: `SNAPS=$(aws ec2 describe-images --image-ids <ami-id> \\
  --query 'Images[].BlockDeviceMappings[].Ebs.SnapshotId' --output text)
aws ec2 deregister-image --image-id <ami-id>
for s in $SNAPS; do aws ec2 delete-snapshot --snapshot-id "$s"; done`,
      description: 'Deregistering an AMI does not delete its snapshots, which keep costing money. Capture the snapshot IDs first, then deregister, then delete.',
      flags: [
        ['Images[].BlockDeviceMappings[].Ebs.SnapshotId', 'Collects every EBS snapshot behind the image (multi-volume AMIs have several).'],
        ['delete-snapshot', 'Fails with `InvalidSnapshot.InUse` if another AMI still references the snapshot, which is the safe outcome.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'danger', text: 'Launch templates and Auto Scaling groups that reference the AMI will fail to launch afterwards. Check `aws ec2 describe-launch-template-versions --versions \'$Latest\' --query "LaunchTemplateVersions[?LaunchTemplateData.ImageId==\\`<ami-id>\\`]"` first.' },
      iam: ['ec2:DescribeImages', 'ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
      related: ['ec2-describe-images-own', 'ec2-describe-snapshots'],
      tags: ['destructive', 'scripting']
    },
    {
      id: 'describe-snapshots',
      subtopic: 'storage',
      title: 'List your snapshots older than a date',
      command: `aws ec2 describe-snapshots \\
  --owner-ids self \\
  --query 'Snapshots[?StartTime<=\`2026-06-01\`].{ID:SnapshotId,Vol:VolumeId,GiB:VolumeSize,Started:StartTime,Desc:Description}' \\
  --output table`,
      description: 'Finds old snapshots that are candidates for cleanup. As with AMIs, `--owner-ids self` is essential or the call returns every public snapshot.',
      flags: [
        ['--owner-ids self', 'Restrict to your account.'],
        ['[?StartTime<=`2026-06-01`]', 'String comparison on the ISO timestamp works because the format is lexically sortable.'],
        ['--filters Name=tag:Backup,Values=daily', '(optional) Server-side tag filter.']
      ],
      output: { format: 'table', body: `--------------------------------------------------------------------------------------------------------------------------------
|                                                      DescribeSnapshots                                                       |
+------------------------------------+-------+--------------------------+----------------------------+-------------------------+
|                Desc                |  GiB  |            ID            |          Started           |           Vol           |
+------------------------------------+-------+--------------------------+----------------------------+-------------------------+
|  Created by CreateImage(i-0abc..)  |  30   |  snap-0123456789abcdef0  |  2026-03-01T03:10:12.114Z  |  vol-0abc123def4567890  |
|  nightly web-1 root                |  30   |  snap-0fedcba9876543210  |  2026-05-30T02:00:03.541Z  |  vol-0abc123def4567890  |
+------------------------------------+-------+--------------------------+----------------------------+-------------------------+` },
      iam: ['ec2:DescribeSnapshots'],
      related: ['ec2-create-snapshot', 'ec2-deregister-image'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'create-snapshot',
      subtopic: 'storage',
      title: 'Snapshot a volume with tags',
      command: `aws ec2 create-snapshot \\
  --volume-id <volume-id> \\
  --description "web-1 root before kernel upgrade" \\
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=web-1-root},{Key=Retention,Value=30d}]'`,
      description: 'Point-in-time copy of an EBS volume. The call returns immediately with state `pending`; the snapshot is usable once `State` is `completed`.',
      flags: [
        ['--tag-specifications', 'Tags at creation, so lifecycle scripts can find and expire the snapshot.'],
        ['aws ec2 wait snapshot-completed --snapshot-ids …', '(follow-up) Block until the copy finishes.']
      ],
      output: { format: 'json', body: `{
    "Description": "web-1 root before kernel upgrade",
    "Encrypted": true,
    "OwnerId": "123456789012",
    "Progress": "",
    "SnapshotId": "snap-0abc123def4567890",
    "StartTime": "2026-09-18T14:22:31.212000+00:00",
    "State": "pending",
    "VolumeId": "vol-0abc123def4567890",
    "VolumeSize": 30,
    "Tags": [
        {
            "Key": "Name",
            "Value": "web-1-root"
        },
        {
            "Key": "Retention",
            "Value": "30d"
        }
    ]
}` },
      note: { type: 'info', text: 'For a consistent multi-volume snapshot of one instance use `aws ec2 create-snapshots --instance-specification InstanceId=<instance-id>` (plural).' },
      iam: ['ec2:CreateSnapshot', 'ec2:CreateTags'],
      related: ['ec2-describe-snapshots', 'ec2-create-image'],
      tags: ['mutating']
    },
    {
      id: 'describe-volumes-unattached',
      subtopic: 'storage',
      title: 'Find unattached (orphaned) volumes',
      command: `aws ec2 describe-volumes \\
  --filters Name=status,Values=available \\
  --query 'Volumes[].{ID:VolumeId,GiB:Size,Type:VolumeType,AZ:AvailabilityZone,Created:CreateTime}' \\
  --output table`,
      description: 'Volumes in state `available` are not attached to anything and are billed anyway. This is one of the first sweeps in any cost review.',
      flags: [
        ['--filters Name=status,Values=available', 'Server-side filter on attachment state. Other values: `in-use`, `creating`, `deleting`.'],
        ['--query', 'Flatten to the columns worth looking at.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------
|                                   DescribeVolumes                                    |
+--------------+----------------------------+-------+-------------------------+--------+
|      AZ      |          Created           |  GiB  |            ID           |  Type  |
+--------------+----------------------------+-------+-------------------------+--------+
|  us-east-1a  |  2025-11-04T18:31:02.318Z  |  100  |  vol-0123456789abcdef0  |  gp3   |
|  us-east-1b  |  2026-02-19T09:12:44.001Z  |  500  |  vol-0fedcba9876543210  |  gp2   |
+--------------+----------------------------+-------+-------------------------+--------+` },
      iam: ['ec2:DescribeVolumes'],
      related: ['ec2-describe-snapshots', 'cost-get-cost-and-usage'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'describe-sg-rules',
      subtopic: 'security-groups',
      title: 'Show the rules of a security group as a table',
      command: `aws ec2 describe-security-group-rules \\
  --filters Name=group-id,Values=<sg-id> \\
  --query 'SecurityGroupRules[].{Egress:IsEgress,Proto:IpProtocol,From:FromPort,To:ToPort,CIDR:CidrIpv4,SrcSG:ReferencedGroupInfo.GroupId,Desc:Description}' \\
  --output table`,
      description: 'The rules API (2021+) returns one flat record per rule, which is far easier to read and diff than the nested `IpPermissions` blocks of `describe-security-groups`.',
      flags: [
        ['--filters Name=group-id,Values=…', 'Required unless you want every rule in the region.'],
        ['Proto', '`-1` means all protocols; ports are `-1` for ICMP and all-traffic rules.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------------------
|                                    DescribeSecurityGroupRules                                    |
+---------------+------------------+----------+--------+---------+------------------------+--------+
|      CIDR     |       Desc       |  Egress  |  From  |  Proto  |         SrcSG          |   To   |
+---------------+------------------+----------+--------+---------+------------------------+--------+
|  10.0.0.0/16  |  internal https  |  False   |  443   |  tcp    |  None                  |  443   |
|  None         |  from alb        |  False   |  8080  |  tcp    |  sg-0a1b2c3d4e5f6a7b8  |  8080  |
|  0.0.0.0/0    |  None            |  True    |  -1    |  -1     |  None                  |  -1    |
+---------------+------------------+----------+--------+---------+------------------------+--------+` },
      iam: ['ec2:DescribeSecurityGroupRules'],
      related: ['ec2-authorize-ingress', 'ec2-revoke-ingress', 'ec2-find-open-sgs'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'authorize-ingress',
      subtopic: 'security-groups',
      title: 'Open a port to a CIDR with a rule description',
      command: `aws ec2 authorize-security-group-ingress \\
  --group-id <sg-id> \\
  --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=10.0.0.0/8,Description="corp vpn"}]'`,
      description: 'Adds an inbound rule. The `--ip-permissions` form is longer than `--protocol tcp --port 22 --cidr 10.0.0.0/8` but is the only way to attach a description, which is what saves the next person from guessing.',
      flags: [
        ['--ip-permissions', 'Structured rule. Use `UserIdGroupPairs=[{GroupId=sg-…}]` instead of `IpRanges` to allow another security group.'],
        ['--protocol/--port/--cidr', 'Simple form; equivalent but without descriptions. `--port 8000-8080` opens a range.']
      ],
      output: { format: 'json', body: `{
    "Return": true,
    "SecurityGroupRules": [
        {
            "SecurityGroupRuleId": "sgr-0abc123def4567890",
            "GroupId": "sg-0a1b2c3d4e5f6a7b8",
            "GroupOwnerId": "123456789012",
            "IsEgress": false,
            "IpProtocol": "tcp",
            "FromPort": 22,
            "ToPort": 22,
            "CidrIpv4": "10.0.0.0/8",
            "Description": "corp vpn"
        }
    ]
}` },
      note: { type: 'gotcha', text: 'Adding a rule that already exists fails with `InvalidPermission.Duplicate`. Security group rules are stateful, so you never need a matching egress rule for the reply traffic.' },
      iam: ['ec2:AuthorizeSecurityGroupIngress'],
      related: ['ec2-revoke-ingress', 'ec2-describe-sg-rules'],
      tags: ['mutating', 'security']
    },
    {
      id: 'revoke-ingress',
      subtopic: 'security-groups',
      title: 'Remove an inbound rule by ID',
      command: `aws ec2 revoke-security-group-ingress \\
  --group-id <sg-id> \\
  --security-group-rule-ids <sgr-id>`,
      description: 'Deleting by rule ID is unambiguous. The alternative is to restate the exact protocol, port and CIDR of the rule, which silently does nothing if any detail differs.',
      flags: [
        ['--security-group-rule-ids', 'One or more `sgr-…` IDs from `describe-security-group-rules`.'],
        ['--protocol tcp --port 22 --cidr 0.0.0.0/0', 'Alternative match-by-value form.']
      ],
      output: { format: 'json', body: `{
    "Return": true,
    "RevokedSecurityGroupRules": [
        {
            "SecurityGroupRuleId": "sgr-0abc123def4567890",
            "GroupId": "sg-0a1b2c3d4e5f6a7b8",
            "IsEgress": false,
            "IpProtocol": "tcp",
            "FromPort": 22,
            "ToPort": 22,
            "CidrIpv4": "0.0.0.0/0"
        }
    ]
}` },
      iam: ['ec2:RevokeSecurityGroupIngress'],
      related: ['ec2-describe-sg-rules', 'ec2-find-open-sgs'],
      tags: ['mutating', 'security']
    },
    {
      id: 'find-open-sgs',
      subtopic: 'security-groups',
      title: 'Find security groups that expose SSH or RDP to the internet',
      command: `aws ec2 describe-security-groups \\
  --filters Name=ip-permission.cidr,Values=0.0.0.0/0 Name=ip-permission.from-port,Values=22,3389 \\
  --query 'SecurityGroups[].[GroupId,GroupName,VpcId]' \\
  --output text`,
      description: 'Server-side filters do the heavy lifting: groups with any inbound rule from `0.0.0.0/0` whose starting port is 22 or 3389. Follow up with `describe-security-group-rules` to see the exact rule.',
      flags: [
        ['Name=ip-permission.cidr', 'Match on inbound rule CIDR. Use `egress.ip-permission.cidr` for outbound rules.'],
        ['Name=ip-permission.from-port', 'Matches the rule\'s FromPort. A `0-65535` all-ports rule has FromPort 0 and will not match; add `Values=0` to catch it.']
      ],
      output: { format: 'text', body: `sg-0a1b2c3d4e5f6a7b8	legacy-bastion	vpc-0a1b2c3d
sg-0f9e8d7c6b5a43210	default	vpc-0a1b2c3d` },
      iam: ['ec2:DescribeSecurityGroups'],
      related: ['ec2-describe-sg-rules', 'ec2-revoke-ingress', 'security-securityhub-findings'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'create-key-pair',
      subtopic: 'key-pairs',
      title: 'Create an ED25519 key pair and save the private key',
      command: `aws ec2 create-key-pair \\
  --key-name <key-name> \\
  --key-type ed25519 \\
  --key-format pem \\
  --query KeyMaterial \\
  --output text > <key-name>.pem && chmod 400 <key-name>.pem`,
      description: 'AWS returns the private key exactly once, inside the JSON response. `--query KeyMaterial --output text` extracts it verbatim so the file is a valid PEM.',
      flags: [
        ['--key-type ed25519', 'Modern, short keys. Use `rsa` only for older Windows AMIs or tooling that cannot handle ED25519.'],
        ['--key-format pem', 'OpenSSH-compatible PEM. `ppk` outputs a PuTTY key.'],
        ['--query KeyMaterial --output text', 'Without this you would get JSON with escaped newlines, not a usable key file.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'gotcha', text: 'Prefer `import-key-pair --public-key-material fileb://~/.ssh/id_ed25519.pub` so the private key never leaves your machine. Either way, SSM Session Manager removes the need for SSH keys entirely.' },
      iam: ['ec2:CreateKeyPair'],
      related: ['ec2-run-instances', 'ssm-start-session'],
      tags: ['mutating', 'security']
    }
  ]
});
