/* Topic: CloudWatch & Logs */
AWSCHEAT.register({
  id: 'cloudwatch',
  title: 'CloudWatch & Logs',
  order: 9,
  intro: 'Logs first (tail, filter, Insights), then metrics and alarms. Times are the recurring trap: `logs` wants epoch milliseconds, `cloudwatch` wants ISO 8601 or epoch seconds, and Insights wants epoch seconds.',
  subtopics: [
    { id: 'logs', title: 'Log groups & events' },
    { id: 'insights', title: 'Logs Insights' },
    { id: 'metrics', title: 'Metrics' },
    { id: 'alarms', title: 'Alarms' }
  ],
  cards: [
    {
      id: 'logs-tail',
      subtopic: 'logs',
      title: 'Tail a log group live',
      command: `aws logs tail /aws/lambda/<function-name> --follow --since 10m --format short`,
      description: 'The v2-only `tail` command streams new events from every stream in the group, like `tail -f` on a distributed log. Combine `--filter-pattern` to watch only errors.',
      flags: [
        ['--follow', 'Keep streaming until Ctrl-C.'],
        ['--since', 'Relative (`10m`, `2h`, `3d`) or absolute ISO 8601 start.'],
        ['--format short', 'Timestamp and message only; `detailed` adds stream names; `json` for machine parsing.'],
        ['--filter-pattern "ERROR"', '(optional) Same syntax as `filter-log-events`.'],
        ['--log-stream-name-prefix 2026/09/18', '(optional) Restrict to streams whose name starts with the prefix.']
      ],
      output: { format: 'plain', body: `2026-09-18T15:04:12 INIT_START Runtime Version: python:3.12.v30
2026-09-18T15:04:13 START RequestId: 7d8e9f0a-1b2c-3d4e-5f60-718293a4b5c6 Version: $LATEST
2026-09-18T15:04:13 [INFO] processing 42 records from example-bucket/reports/
2026-09-18T15:04:14 END RequestId: 7d8e9f0a-1b2c-3d4e-5f60-718293a4b5c6
2026-09-18T15:04:14 REPORT RequestId: 7d8e9f0a-1b2c-3d4e-5f60-718293a4b5c6	Duration: 812.44 ms	Billed Duration: 813 ms	Memory Size: 256 MB	Max Memory Used: 91 MB` },
      iam: ['logs:DescribeLogGroups', 'logs:DescribeLogStreams', 'logs:FilterLogEvents', 'logs:StartLiveTail'],
      related: ['cloudwatch-filter-log-events', 'cloudwatch-insights-start-query'],
      tags: ['read-only', 'interactive']
    },
    {
      id: 'filter-log-events',
      subtopic: 'logs',
      title: 'Search a log group for a pattern in a time window',
      command: `aws logs filter-log-events \\
  --log-group-name /aws/lambda/<function-name> \\
  --start-time $(($(date +%s) - 3600))000 \\
  --filter-pattern '"Task timed out"' \\
  --query 'events[].[timestamp,logStreamName,message]' \\
  --output text | head -20`,
      description: 'Scans all streams in the group for events matching the pattern. Quoted phrases match literally; unquoted terms are ANDed; `?term` means OR; `-term` excludes. JSON logs support `{ $.level = "ERROR" }`.',
      flags: [
        ['--start-time / --end-time', 'Epoch milliseconds. The arithmetic appends `000` to seconds.'],
        ['--filter-pattern', 'CloudWatch filter syntax, not regex (Insights has regex).'],
        ['--log-stream-names', '(optional) Restrict to specific streams.'],
        ['--interleaved', 'Legacy flag; events are already interleaved by time in v2.']
      ],
      output: { format: 'text', body: `1758207901234	2026/09/18/[$LATEST]0a1b2c3d4e5f67890abcdef012345678	2026-09-18T15:05:01.234Z 7d8e9f0a-1b2c-3d4e-5f60-718293a4b5c6 Task timed out after 30.03 seconds` },
      note: { type: 'gotcha', text: 'On macOS `date` has no `-d`; use `date -v-1H +%s`. Time arithmetic is the number-one cause of "no results": check that you produced 13 digits.' },
      iam: ['logs:FilterLogEvents'],
      related: ['cloudwatch-logs-tail', 'vpc-flow-logs-query', 'cloudwatch-insights-start-query'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-log-groups',
      subtopic: 'logs',
      title: 'List log groups with retention and stored size',
      command: `aws logs describe-log-groups \\
  --query 'sort_by(logGroups,&storedBytes)[-10:].[logGroupName,retentionInDays,storedBytes]' \\
  --output table`,
      description: 'Groups with `None` retention keep data forever and are usually the biggest line on the CloudWatch bill. Sorting by `storedBytes` surfaces them.',
      flags: [
        ['--log-group-name-prefix /aws/lambda/', '(optional) Server-side prefix filter.'],
        ['sort_by(logGroups,&storedBytes)[-10:]', 'Ten largest groups.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------
|                   DescribeLogGroups                    |
+-------------------------------+--------+---------------+
|  /aws/lambda/report-fn        |  14    |  3145728000   |
|  /ecs/api                     |  None  |  48318382080  |
|  /vpc/flow-logs/vpc-0a1b2c3d  |  30    |  91268055040  |
+-------------------------------+--------+---------------+` },
      iam: ['logs:DescribeLogGroups'],
      related: ['cloudwatch-put-retention-policy', 'cost-get-cost-and-usage'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'put-retention-policy',
      subtopic: 'logs',
      title: 'Set retention on one group, or on every group that has none',
      command: `aws logs put-retention-policy --log-group-name /ecs/api --retention-in-days 30
# every group with no retention:
aws logs describe-log-groups --query 'logGroups[?!retentionInDays].logGroupName' --output text |
  tr '\\t' '\\n' | xargs -r -n1 -I{} aws logs put-retention-policy --log-group-name {} --retention-in-days 30`,
      description: 'Retention deletes events older than N days automatically. The loop form applies a default to every unbounded group, which is the single most effective CloudWatch cost control.',
      flags: [
        ['--retention-in-days', 'One of 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653.'],
        ['[?!retentionInDays]', 'JMESPath: groups where the field is null.'],
        ['delete-retention-policy', 'Back to infinite retention.']
      ],
      output: { format: 'none', body: '' },
      iam: ['logs:PutRetentionPolicy', 'logs:DescribeLogGroups'],
      related: ['cloudwatch-describe-log-groups', 'scripting-xargs-parallel'],
      tags: ['mutating', 'cost', 'scripting']
    },
    {
      id: 'latest-stream',
      subtopic: 'logs',
      title: 'Find the most recently written streams in a group',
      command: `aws logs describe-log-streams \\
  --log-group-name /ecs/api \\
  --order-by LastEventTime --descending --limit 5 \\
  --query 'logStreams[].[logStreamName,lastEventTimestamp]' \\
  --output text`,
      description: 'When a group has thousands of streams (one per task or Lambda container) this finds the live ones. Feed a name into `get-log-events --log-stream-name` to read a single stream in order.',
      flags: [
        ['--order-by LastEventTime --descending', 'Newest activity first. Cannot be combined with `--log-stream-name-prefix`.'],
        ['--limit', 'Max 50 per page.']
      ],
      output: { format: 'text', body: `ecs/api/0a1b2c3d4e5f67890abcdef012345678	1758207950123
ecs/api/1b2c3d4e5f67890abcdef0123456789a	1758207948877` },
      iam: ['logs:DescribeLogStreams'],
      related: ['cloudwatch-logs-tail', 'cloudwatch-filter-log-events'],
      tags: ['read-only', 'query']
    },
    {
      id: 'insights-start-query',
      subtopic: 'insights',
      title: 'Run a Logs Insights query',
      command: `QUERY_ID=$(aws logs start-query \\
  --log-group-names /ecs/api /ecs/worker \\
  --start-time $(($(date +%s) - 3600)) --end-time $(date +%s) \\
  --query-string 'fields @timestamp, @logStream, @message | filter @message like /ERROR|Exception/ | sort @timestamp desc | limit 20' \\
  --query queryId --output text)
echo "$QUERY_ID"`,
      description: 'Insights is asynchronous: `start-query` returns an ID and `get-query-results` returns rows once the status is `Complete`. Unlike `filter-log-events` it supports regex, aggregation (`stats count() by bin(5m)`) and multiple groups.',
      flags: [
        ['--log-group-names', 'Up to 50 groups. `--log-group-identifiers` accepts ARNs for cross-account.'],
        ['--start-time / --end-time', 'Epoch **seconds** here, not milliseconds.'],
        ['--query-string', 'Insights query language. `--limit` caps rows (max 10 000).']
      ],
      output: { format: 'text', body: `0a1b2c3d-4e5f-6789-abcd-ef0123456789` },
      iam: ['logs:StartQuery'],
      related: ['cloudwatch-insights-get-results', 'cloudwatch-filter-log-events'],
      tags: ['read-only', 'query']
    },
    {
      id: 'insights-get-results',
      subtopic: 'insights',
      title: 'Fetch Insights query results as rows',
      command: `aws logs get-query-results --query-id <query-id> \\
  --query 'results[].[ [0].value, [2].value ]' --output text`,
      description: 'Each result row is a list of `{field, value}` objects, so the JMESPath picks fields by position (here `@timestamp` and `@message`). Poll until `status` is `Complete`; `Running` returns partial rows.',
      flags: [
        ['results[].[ [0].value, [2].value ]', 'Positional access into each row\'s field list, in the order of the `fields` clause.'],
        ['--query status --output text', 'Check completion first: Scheduled, Running, Complete, Failed, Cancelled, Timeout.'],
        ['statistics.recordsScanned', 'How much data the query touched (billing is per GB scanned).']
      ],
      output: { format: 'text', body: `2026-09-18 15:03:44.912	{"level":"ERROR","msg":"upstream timeout","route":"/v1/orders","duration_ms":30012}
2026-09-18 15:01:07.338	{"level":"ERROR","msg":"upstream timeout","route":"/v1/orders","duration_ms":30004}` },
      iam: ['logs:GetQueryResults'],
      related: ['cloudwatch-insights-start-query'],
      tags: ['read-only', 'query']
    },
    {
      id: 'get-metric-statistics',
      subtopic: 'metrics',
      title: 'CPU statistics for an instance over the last hour',
      command: `aws cloudwatch get-metric-statistics \\
  --namespace AWS/EC2 --metric-name CPUUtilization \\
  --dimensions Name=InstanceId,Value=<instance-id> \\
  --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \\
  --period 300 --statistics Average Maximum \\
  --query 'sort_by(Datapoints,&Timestamp)[].[Timestamp,Average,Maximum]' \\
  --output table`,
      description: 'The simpler of the two metric-read APIs: one metric, one set of dimensions. Datapoints come back unordered, hence the `sort_by`. Detailed monitoring is required for periods under 300 s on EC2.',
      flags: [
        ['--period', 'Seconds per datapoint; must be a multiple of 60 and match the metric\'s resolution.'],
        ['--statistics', 'Any of SampleCount, Average, Sum, Minimum, Maximum. `--extended-statistics p99` for percentiles.'],
        ['--dimensions', 'All dimensions of the metric must be given exactly or you get no data.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------
|                     GetMetricStatistics                     |
+-----------------------------+----------------------+--------+
|  2026-09-18T14:05:00+00:00  |  12.416666666666666  |  31.2  |
|  2026-09-18T14:10:00+00:00  |  11.8                |  27.9  |
|  2026-09-18T14:15:00+00:00  |  48.233333333333334  |  91.4  |
+-----------------------------+----------------------+--------+` },
      note: { type: 'gotcha', text: 'Empty `Datapoints` almost always means a dimension mismatch or a time window older than the retention for that period (1-minute data is kept 15 days, 5-minute 63 days).' },
      iam: ['cloudwatch:GetMetricStatistics'],
      related: ['cloudwatch-get-metric-data', 'cloudwatch-put-metric-alarm'],
      tags: ['read-only', 'query']
    },
    {
      id: 'get-metric-data',
      subtopic: 'metrics',
      title: 'Pull several metrics (or a math expression) in one call',
      command: `aws cloudwatch get-metric-data \\
  --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ) --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \\
  --metric-data-queries '[
    {"Id":"cpu","MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"CPUUtilization","Dimensions":[{"Name":"InstanceId","Value":"<instance-id>"}]},"Period":300,"Stat":"Average"}},
    {"Id":"net","MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"NetworkIn","Dimensions":[{"Name":"InstanceId","Value":"<instance-id>"}]},"Period":300,"Stat":"Sum"}},
    {"Id":"mbps","Expression":"net*8/300/1000000","Label":"NetworkIn Mbps"}
  ]' \\
  --query 'MetricDataResults[].{Id:Id,Label:Label,Last:Values[0],Status:StatusCode}'`,
      description: 'The batch API: up to 500 metrics per call, plus metric math expressions referencing other IDs. It is what dashboards use, and it is cheaper per datapoint than repeated `get-metric-statistics`.',
      flags: [
        ['--metric-data-queries', 'JSON list; `Id` must be lowercase-first. Use `file://queries.json` for anything long.'],
        ['Expression', 'Metric math (`SUM`, `RATE`, `ANOMALY_DETECTION_BAND`, …) over other query IDs.'],
        ['--scan-by TimestampDescending', '(optional) Newest values first so `Values[0]` is the latest.']
      ],
      output: { format: 'json', body: `[
    {
        "Id": "cpu",
        "Label": "CPUUtilization",
        "Last": 48.233333333333334,
        "Status": "Complete"
    },
    {
        "Id": "net",
        "Label": "NetworkIn",
        "Last": 184201344.0,
        "Status": "Complete"
    },
    {
        "Id": "mbps",
        "Label": "NetworkIn Mbps",
        "Last": 4.912035840000001,
        "Status": "Complete"
    }
]` },
      iam: ['cloudwatch:GetMetricData'],
      related: ['cloudwatch-get-metric-statistics', 'scripting-cli-input-json'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-alarms',
      subtopic: 'alarms',
      title: 'List alarms currently in ALARM state',
      command: `aws cloudwatch describe-alarms \\
  --state-value ALARM \\
  --query 'MetricAlarms[].[AlarmName,StateUpdatedTimestamp,StateReason]' \\
  --output table`,
      description: 'The on-call view. `StateReason` explains the threshold breach in words; `--alarm-name-prefix` narrows to a service. Composite alarms are listed separately under `CompositeAlarms`.',
      flags: [
        ['--state-value', 'OK, ALARM or INSUFFICIENT_DATA.'],
        ['--alarm-name-prefix prod-', '(optional) Name filter.'],
        ['--alarm-types CompositeAlarm MetricAlarm', '(optional) Include composite alarms.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------------------------------------------------------------------------------------------------------
|                                                                        DescribeAlarms                                                                       |
+---------------------+------------------------------------+--------------------------------------------------------------------------------------------------+
|  prod-api-5xx-rate  |  2026-09-18T15:02:11.482000+00:00  |  Threshold Crossed: 1 datapoint [3.4 (18/09/26 15:00:00)] was greater than the threshold (1.0).  |
|  prod-db-cpu-high   |  2026-09-18T14:47:00.117000+00:00  |  Threshold Crossed: 3 out of the last 3 datapoints were greater than the threshold (80.0).       |
+---------------------+------------------------------------+--------------------------------------------------------------------------------------------------+` },
      iam: ['cloudwatch:DescribeAlarms'],
      related: ['cloudwatch-put-metric-alarm', 'cloudwatch-set-alarm-state'],
      tags: ['read-only', 'query']
    },
    {
      id: 'put-metric-alarm',
      subtopic: 'alarms',
      title: 'Create a CPU alarm that notifies an SNS topic',
      command: `aws cloudwatch put-metric-alarm \\
  --alarm-name "<instance-id>-cpu-high" \\
  --namespace AWS/EC2 --metric-name CPUUtilization \\
  --dimensions Name=InstanceId,Value=<instance-id> \\
  --statistic Average --period 300 \\
  --evaluation-periods 3 --datapoints-to-alarm 3 \\
  --threshold 80 --comparison-operator GreaterThanThreshold \\
  --treat-missing-data notBreaching \\
  --alarm-actions arn:aws:sns:us-east-1:123456789012:<topic-name> \\
  --ok-actions arn:aws:sns:us-east-1:123456789012:<topic-name>`,
      description: 'Alarms when the 5-minute average exceeds 80% for three consecutive periods (15 minutes). `put-metric-alarm` is idempotent by name: rerunning it updates the alarm in place.',
      flags: [
        ['--evaluation-periods / --datapoints-to-alarm', '"M out of N" evaluation. Equal values mean every period must breach.'],
        ['--treat-missing-data', '`missing` (default), `notBreaching`, `breaching`, `ignore`. For instances that stop, `notBreaching` avoids flapping.'],
        ['--alarm-actions / --ok-actions / --insufficient-data-actions', 'SNS topic, Auto Scaling policy, EC2 action (`arn:aws:automate:us-east-1:ec2:reboot`) or SSM OpsItem.']
      ],
      output: { format: 'none', body: '' },
      iam: ['cloudwatch:PutMetricAlarm'],
      related: ['cloudwatch-describe-alarms', 'cloudwatch-set-alarm-state', 'rds-elb-asg-r53-asg-set-desired'],
      tags: ['mutating']
    },
    {
      id: 'set-alarm-state',
      subtopic: 'alarms',
      title: 'Force an alarm state to test its actions',
      command: `aws cloudwatch set-alarm-state \\
  --alarm-name "<alarm-name>" \\
  --state-value ALARM \\
  --state-reason "manual test of paging path"`,
      description: 'Temporarily overrides the state so the alarm actions fire (SNS, Auto Scaling, EC2 actions). The next metric evaluation sets it back, usually within a period, so this is a safe way to verify the notification chain.',
      flags: [
        ['--state-value', 'OK, ALARM or INSUFFICIENT_DATA.'],
        ['--state-reason', 'Required; shown in alarm history.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'gotcha', text: 'If the alarm has an EC2 action such as reboot or terminate, this will really execute it. Check `--query MetricAlarms[].AlarmActions` before testing.' },
      iam: ['cloudwatch:SetAlarmState'],
      related: ['cloudwatch-describe-alarms', 'cloudwatch-put-metric-alarm'],
      tags: ['mutating']
    }
  ]
});
