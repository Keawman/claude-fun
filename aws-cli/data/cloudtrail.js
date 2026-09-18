/* Topic: CloudTrail */
AWSCHEAT.register({
  id: 'cloudtrail',
  title: 'CloudTrail',
  order: 10,
  intro: '`lookup-events` searches the last 90 days of management events in the current region without needing a trail or Athena. One attribute per call, so pick the most selective one (user, event name, resource) and refine client-side.',
  subtopics: [
    { id: 'lookup', title: 'lookup-events patterns' },
    { id: 'trails', title: 'Trails & status' }
  ],
  cards: [
    {
      id: 'by-user',
      subtopic: 'lookup',
      title: 'What did a user or role session do recently?',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=Username,AttributeValue=<user-name> \\
  --start-time $(date -u -d '-24 hours' +%Y-%m-%dT%H:%M:%SZ) \\
  --max-results 50 \\
  --query 'Events[].[EventTime,EventSource,EventName,Resources[0].ResourceName]' \\
  --output table`,
      description: '`Username` matches the IAM user name, or for assumed roles the session name (the part after the slash in the STS ARN). Results are newest first.',
      flags: [
        ['--lookup-attributes', 'Exactly one `AttributeKey`/`AttributeValue` pair per call.'],
        ['--start-time / --end-time', 'ISO 8601 UTC. Default window is the full 90 days, which is slow.'],
        ['--max-results', 'Per page (max 50); the CLI pages through unless you add `--no-paginate`.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------------------------------------------------
|                                              LookupEvents                                             |
+-----------------------------+---------------------+-------------------------+-------------------------+
|  2026-09-18T14:41:10+00:00  |  iam.amazonaws.com  |  CreateInstanceProfile  |  ssm-managed-instance   |
|  2026-09-18T14:40:02+00:00  |  iam.amazonaws.com  |  CreateRole             |  ssm-managed-instance   |
|  2026-09-18T14:22:31+00:00  |  ec2.amazonaws.com  |  CreateSnapshot         |  vol-0abc123def4567890  |
+-----------------------------+---------------------+-------------------------+-------------------------+` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-by-event-name', 'cloudtrail-parse-event'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'by-event-name',
      subtopic: 'lookup',
      title: 'Who ran a specific API call (e.g. TerminateInstances)?',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=EventName,AttributeValue=TerminateInstances \\
  --start-time $(date -u -d '-7 days' +%Y-%m-%dT%H:%M:%SZ) \\
  --query 'Events[].{Time:EventTime,User:Username,Resources:Resources[].ResourceName}'`,
      description: 'Event names are the API operation names in CamelCase. This is the "who deleted it" query: `DeleteBucket`, `DeleteDBInstance`, `DeleteStack`, `PutBucketPolicy`, `AuthorizeSecurityGroupIngress`.',
      flags: [
        ['AttributeKey=EventName', 'Case-sensitive operation name.'],
        ['Resources[].ResourceName', 'IDs the event touched (instance IDs, bucket names, ARNs).']
      ],
      output: { format: 'json', body: `[
    {
        "Time": "2026-09-17T22:14:03+00:00",
        "User": "alice",
        "Resources": [
            "i-0fedcba9876543210"
        ]
    }
]` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-by-resource', 'cloudtrail-by-user'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'by-resource',
      subtopic: 'lookup',
      title: 'Every event that touched a resource ID',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=<instance-id> \\
  --query 'Events[].[EventTime,EventName,Username]' \\
  --output text`,
      description: 'The history of one instance, bucket, role or security group: creation, tag changes, attribute modifications, termination. `ResourceType` (e.g. `AWS::EC2::Instance`) is the alternative key for a class of resources.',
      flags: [
        ['AttributeKey=ResourceName', 'Exact ID or name as CloudTrail recorded it (ARNs for IAM, bucket names for S3).'],
        ['AttributeKey=ResourceType', 'e.g. `AWS::S3::Bucket`, `AWS::IAM::Role`.']
      ],
      output: { format: 'text', body: `2026-09-18T14:22:31+00:00	CreateSnapshot	alice
2026-09-18T13:10:07+00:00	ModifyInstanceMetadataOptions	alice
2026-09-16T14:02:11+00:00	RunInstances	svc-ci` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-by-event-name', 'cloudtrail-by-access-key'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'by-access-key',
      subtopic: 'lookup',
      title: 'What was an access key used for?',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=<access-key-id> \\
  --query 'Events[].[EventTime,EventSource,EventName]' \\
  --output text | sort | uniq -c | sort -rn | head`,
      description: 'The first query to run when a key leaks. Combine with `sts get-access-key-info` to identify the account and `iam update-access-key --status Inactive` to stop the bleeding.',
      flags: [
        ['AttributeKey=AccessKeyId', 'Long-term `AKIA…` or temporary `ASIA…` key ID.'],
        ['| sort | uniq -c', 'Shell-side aggregation by event; lookup-events has no group-by.']
      ],
      output: { format: 'plain', body: `     41 2026-09-18T15:07:12+00:00	s3.amazonaws.com	ListBuckets
     12 2026-09-18T15:06:58+00:00	iam.amazonaws.com	ListUsers
      3 2026-09-18T15:06:41+00:00	sts.amazonaws.com	GetCallerIdentity` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['sts-get-access-key-info', 'iam-rotate-access-key'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'write-only',
      subtopic: 'lookup',
      title: 'Only mutating calls in the last hour',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=ReadOnly,AttributeValue=false \\
  --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) \\
  --query 'Events[?!contains(EventName, \`Assume\`)].[EventTime,Username,EventName]' \\
  --output text`,
      description: 'Filters out the Describe/List/Get noise to show what changed. The JMESPath drops `AssumeRole` events, which are technically writes but rarely interesting during an incident.',
      flags: [
        ['AttributeKey=ReadOnly,AttributeValue=false', 'Server-side filter to write events.'],
        ['[?!contains(EventName, `Assume`)]', 'Client-side exclusion; adjust to taste.']
      ],
      output: { format: 'text', body: `2026-09-18T15:02:37+00:00	alice	PutParameter
2026-09-18T14:50:31+00:00	alice	CreateVpcEndpoint
2026-09-18T14:41:10+00:00	svc-ci	CreateInstanceProfile` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-by-user', 'cloudtrail-console-logins'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'console-logins',
      subtopic: 'lookup',
      title: 'Console sign-ins, including failures and MFA usage',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \\
  --region us-east-1 \\
  --query 'Events[].CloudTrailEvent' --output text |
  jq -r '[.eventTime, .userIdentity.userName // .userIdentity.arn, .sourceIPAddress, .responseElements.ConsoleLogin, .additionalEventData.MFAUsed] | @tsv'`,
      description: 'Sign-in events are global and recorded in us-east-1 (or the region of the sign-in endpoint), hence the explicit region. The detail you want (success, MFA, source IP) is only inside the raw `CloudTrailEvent` JSON, so `jq` parses it.',
      flags: [
        ['--region us-east-1', 'Global service events land here for commercial accounts (us-gov-west-1 in GovCloud).'],
        ['Events[].CloudTrailEvent', 'The full event as a JSON string, one per line with text output.']
      ],
      output: { format: 'text', body: `2026-09-18T08:03:19Z	alice	203.0.113.42	Success	Yes
2026-09-18T07:58:41Z	alice	203.0.113.42	Failure	No` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-parse-event', 'iam-list-mfa-devices'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'parse-event',
      subtopic: 'lookup',
      title: 'Extract fields from the raw CloudTrailEvent JSON',
      command: `aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=EventName,AttributeValue=AuthorizeSecurityGroupIngress \\
  --query 'Events[].CloudTrailEvent' --output text |
  jq -r '[.eventTime, .userIdentity.arn, .sourceIPAddress, .userAgent, (.requestParameters | tostring)] | @tsv'`,
      description: 'The summary fields returned by lookup-events are thin; `requestParameters`, `responseElements`, `errorCode` and `userAgent` live in the embedded JSON. This idiom turns them into TSV for grep and spreadsheets.',
      flags: [
        ['--query Events[].CloudTrailEvent --output text', 'One raw JSON document per line.'],
        ['jq -r … | @tsv', 'Pick fields, tab-separate. `.errorCode // "ok"` shows failed calls.']
      ],
      output: { format: 'text', body: `2026-09-18T14:33:02Z	arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice	203.0.113.42	aws-cli/2.17.32 md/awscrt#0.20.11 ua/2.0 os/linux#6.8.0 md/arch#x86_64 lang/python#3.11.9 md/pyimpl#CPython exec-env/Terminal cfg/retry-mode#standard md/installer#exe md/prompt#off md/command#ec2.authorize-security-group-ingress	{"groupId":"sg-0a1b2c3d4e5f6a7b8","ipPermissions":{"items":[{"ipProtocol":"tcp","fromPort":22,"toPort":22,"ipRanges":{"items":[{"cidrIp":"10.0.0.0/8","description":"corp vpn"}]}}]}}` },
      iam: ['cloudtrail:LookupEvents'],
      related: ['cloudtrail-console-logins', 'scripting-jq-vs-query'],
      tags: ['read-only', 'query', 'scripting']
    },
    {
      id: 'describe-trails',
      subtopic: 'trails',
      title: 'List trails and where they deliver',
      command: `aws cloudtrail describe-trails \\
  --query 'trailList[].{Name:Name,Bucket:S3BucketName,MultiRegion:IsMultiRegionTrail,Org:IsOrganizationTrail,Logs:CloudWatchLogsLogGroupArn,KMS:KmsKeyId}' \\
  --output table`,
      description: 'A trail is what persists events beyond 90 days and enables Athena/Insights queries. `IsMultiRegionTrail` and an organization trail from the management account are the two settings auditors ask about first.',
      flags: [
        ['--include-shadow-trails', '(default true) Show multi-region trails created in other regions.'],
        ['--trail-name-list <trail-name>', '(optional) Specific trails.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
|                                                                                                  DescribeTrails                                                                                                 |
+-----------------------+-------------------------------------------------------------------------------+------------------------------------------------------------------+---------------+-------------+--------+
|         Bucket        |                                      KMS                                      |                               Logs                               |  MultiRegion  |     Name    |  Org   |
+-----------------------+-------------------------------------------------------------------------------+------------------------------------------------------------------+---------------+-------------+--------+
|  example-bucket-logs  |  arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab  |  arn:aws:logs:us-east-1:123456789012:log-group:CloudTrail/org:*  |  True         |  org-trail  |  True  |
+-----------------------+-------------------------------------------------------------------------------+------------------------------------------------------------------+---------------+-------------+--------+` },
      iam: ['cloudtrail:DescribeTrails'],
      related: ['cloudtrail-get-trail-status', 'cloudtrail-event-selectors'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'get-trail-status',
      subtopic: 'trails',
      title: 'Is the trail logging, and when did it last deliver?',
      command: `aws cloudtrail get-trail-status --name <trail-name> \\
  --query '{Logging:IsLogging,LastDelivery:LatestDeliveryTime,LastError:LatestDeliveryError,LastLogsDelivery:LatestCloudWatchLogsDeliveryTime}'`,
      description: 'A stopped trail (`IsLogging: false`) or a stale `LatestDeliveryTime` means you are flying blind. `StopLogging` is itself an event worth alarming on. Restart with `aws cloudtrail start-logging --name <trail-name>`.',
      flags: [
        ['--name', 'Trail name or ARN. Multi-region trails from another region need the ARN.'],
        ['LatestDeliveryError', 'Typically a bucket policy or KMS key problem after someone "tidied up" permissions.']
      ],
      output: { format: 'json', body: `{
    "Logging": true,
    "LastDelivery": "2026-09-18T15:08:44.912000+00:00",
    "LastError": "",
    "LastLogsDelivery": "2026-09-18T15:08:40.210000+00:00"
}` },
      iam: ['cloudtrail:GetTrailStatus'],
      related: ['cloudtrail-describe-trails', 'security-config-noncompliant-rules'],
      tags: ['read-only', 'security']
    },
    {
      id: 'event-selectors',
      subtopic: 'trails',
      title: 'Check whether data events (S3 objects, Lambda) are recorded',
      command: `aws cloudtrail get-event-selectors --trail-name <trail-name>`,
      description: 'Management events are on by default; object-level S3 and Lambda invoke events are not. If an investigation needs "who read this object", you need data events to have been enabled before it happened.',
      flags: [
        ['put-event-selectors --advanced-event-selectors file://selectors.json', 'Enable data events with field selectors (`eventCategory = Data`, `resources.type = AWS::S3::Object`).']
      ],
      output: { format: 'json', body: `{
    "TrailARN": "arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail",
    "AdvancedEventSelectors": [
        {
            "Name": "Management events",
            "FieldSelectors": [
                {
                    "Field": "eventCategory",
                    "Equals": [
                        "Management"
                    ]
                }
            ]
        },
        {
            "Name": "S3 data events for example-bucket",
            "FieldSelectors": [
                {
                    "Field": "eventCategory",
                    "Equals": [
                        "Data"
                    ]
                },
                {
                    "Field": "resources.type",
                    "Equals": [
                        "AWS::S3::Object"
                    ]
                },
                {
                    "Field": "resources.ARN",
                    "StartsWith": [
                        "arn:aws:s3:::example-bucket/"
                    ]
                }
            ]
        }
    ]
}` },
      iam: ['cloudtrail:GetEventSelectors'],
      related: ['cloudtrail-describe-trails', 's3-bucket-policy'],
      tags: ['read-only', 'security']
    }
  ]
});
