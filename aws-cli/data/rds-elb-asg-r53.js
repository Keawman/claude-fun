/* Topic: RDS, ELB, Auto Scaling, Route 53 */
AWSCHEAT.register({
  id: 'rds-elb-asg-r53',
  title: 'RDS, ELB, Auto Scaling, Route 53',
  order: 12,
  intro: 'The most-used describe and modify calls for the four services that sit around a typical web tier. Load balancer commands are `elbv2` (ALB/NLB); the plain `elb` namespace is Classic Load Balancer only.',
  subtopics: [
    { id: 'rds', title: 'RDS' },
    { id: 'elb', title: 'ELB (elbv2)' },
    { id: 'asg', title: 'Auto Scaling' },
    { id: 'route53', title: 'Route 53' }
  ],
  cards: [
    {
      id: 'rds-describe-instances',
      subtopic: 'rds',
      title: 'List DB instances with engine, class, status and endpoint',
      command: `aws rds describe-db-instances \\
  --query 'DBInstances[].{ID:DBInstanceIdentifier,Engine:Engine,Ver:EngineVersion,Class:DBInstanceClass,Status:DBInstanceStatus,MultiAZ:MultiAZ,Endpoint:Endpoint.Address}' \\
  --output table`,
      description: 'The inventory view. Aurora instances appear here too; the cluster-level endpoints (writer/reader) come from `describe-db-clusters`.',
      flags: [
        ['--db-instance-identifier <db-instance-id>', '(optional) One instance.'],
        ['--filters Name=engine,Values=postgres', '(optional) Server-side filter.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------------------------------------------------------------------------------
|                                                          DescribeDBInstances                                                           |
+-----------------+-------------------------------------------------------+------------+--------------+-----------+-------------+--------+
|      Class      |                        Endpoint                       |   Engine   |      ID      |  MultiAZ  |    Status   |  Ver   |
+-----------------+-------------------------------------------------------+------------+--------------+-----------+-------------+--------+
|  db.r6g.large   |  prod-db.abcdefghijkl.us-east-1.rds.amazonaws.com     |  postgres  |  prod-db     |  True     |  available  |  16.4  |
|  db.t4g.medium  |  staging-db.abcdefghijkl.us-east-1.rds.amazonaws.com  |  postgres  |  staging-db  |  False    |  available  |  16.4  |
+-----------------+-------------------------------------------------------+------------+--------------+-----------+-------------+--------+` },
      iam: ['rds:DescribeDBInstances'],
      related: ['rds-elb-asg-r53-rds-describe-clusters', 'rds-elb-asg-r53-rds-modify'],
      tags: ['read-only', 'query']
    },
    {
      id: 'rds-describe-clusters',
      subtopic: 'rds',
      title: 'Aurora clusters: writer/reader endpoints and members',
      command: `aws rds describe-db-clusters \\
  --query 'DBClusters[].{ID:DBClusterIdentifier,Status:Status,Writer:Endpoint,Reader:ReaderEndpoint,Members:DBClusterMembers[].[DBInstanceIdentifier,IsClusterWriter]}'`,
      description: 'Applications should connect to the cluster endpoints, which follow failovers; this shows which member is currently the writer. `failover-db-cluster` forces a failover for testing.',
      flags: [
        ['DBClusterMembers[].IsClusterWriter', 'Exactly one member is `true`.'],
        ['--db-cluster-identifier', '(optional) One cluster.']
      ],
      output: { format: 'json', body: `[
    {
        "ID": "prod-aurora",
        "Status": "available",
        "Writer": "prod-aurora.cluster-abcdefghijkl.us-east-1.rds.amazonaws.com",
        "Reader": "prod-aurora.cluster-ro-abcdefghijkl.us-east-1.rds.amazonaws.com",
        "Members": [
            [
                "prod-aurora-1",
                true
            ],
            [
                "prod-aurora-2",
                false
            ]
        ]
    }
]` },
      iam: ['rds:DescribeDBClusters'],
      related: ['rds-elb-asg-r53-rds-describe-instances', 'rds-elb-asg-r53-rds-snapshot'],
      tags: ['read-only', 'query']
    },
    {
      id: 'rds-modify',
      subtopic: 'rds',
      title: 'Resize an instance or change settings (now or in the window)',
      command: `aws rds modify-db-instance \\
  --db-instance-identifier <db-instance-id> \\
  --db-instance-class db.r6g.xlarge \\
  --allocated-storage 200 \\
  --apply-immediately`,
      description: 'Class and storage changes cause a restart for a single-AZ instance and a failover for Multi-AZ. Without `--apply-immediately` they queue for the next maintenance window, visible under `PendingModifiedValues`.',
      flags: [
        ['--apply-immediately', 'Do it now. Omit to defer to the maintenance window.'],
        ['--allocated-storage', 'Can only grow; a storage change locks further storage changes for 6 hours.'],
        ['--backup-retention-period 7 / --deletion-protection / --enable-iam-database-authentication', 'Other common modifications in the same call.']
      ],
      output: { format: 'json', body: `{
    "DBInstance": {
        "DBInstanceIdentifier": "prod-db",
        "DBInstanceClass": "db.r6g.large",
        "Engine": "postgres",
        "DBInstanceStatus": "modifying",
        "PendingModifiedValues": {
            "DBInstanceClass": "db.r6g.xlarge",
            "AllocatedStorage": 200
        },
        "MultiAZ": true,
        "EngineVersion": "16.4"
    }
}` },
      note: { type: 'gotcha', text: 'The response is heavily trimmed here; the real one is ~150 lines. Use `--query DBInstance.PendingModifiedValues` to see just what is queued, and `aws rds wait db-instance-available` to block until the change completes.' },
      iam: ['rds:ModifyDBInstance'],
      related: ['rds-elb-asg-r53-rds-describe-instances', 'output-query-waiters'],
      tags: ['mutating']
    },
    {
      id: 'rds-snapshot',
      subtopic: 'rds',
      title: 'Take a manual snapshot before a risky change',
      command: `aws rds create-db-snapshot \\
  --db-instance-identifier <db-instance-id> \\
  --db-snapshot-identifier <db-instance-id>-pre-upgrade-$(date +%Y%m%d) \\
  --tags Key=Reason,Value=pre-upgrade
aws rds wait db-snapshot-completed --db-snapshot-identifier <db-instance-id>-pre-upgrade-$(date +%Y%m%d)`,
      description: 'Manual snapshots persist until you delete them, unlike automated backups that follow the retention period. For Aurora use `create-db-cluster-snapshot` with `--db-cluster-identifier`.',
      flags: [
        ['--db-snapshot-identifier', 'Unique per account and region; letters, digits and hyphens.'],
        ['aws rds wait db-snapshot-completed', 'Blocks until the snapshot is `available` (I/O is briefly suspended on single-AZ instances).']
      ],
      output: { format: 'json', body: `{
    "DBSnapshot": {
        "DBSnapshotIdentifier": "prod-db-pre-upgrade-20260918",
        "DBInstanceIdentifier": "prod-db",
        "Engine": "postgres",
        "AllocatedStorage": 100,
        "Status": "creating",
        "SnapshotType": "manual",
        "PercentProgress": 0,
        "Encrypted": true,
        "DBSnapshotArn": "arn:aws:rds:us-east-1:123456789012:snapshot:prod-db-pre-upgrade-20260918"
    }
}` },
      iam: ['rds:CreateDBSnapshot', 'rds:AddTagsToResource', 'rds:DescribeDBSnapshots'],
      related: ['rds-elb-asg-r53-rds-modify', 'rds-elb-asg-r53-rds-events'],
      tags: ['mutating', 'waiter']
    },
    {
      id: 'rds-events',
      subtopic: 'rds',
      title: 'Recent events for an instance (failovers, reboots, backups)',
      command: `aws rds describe-events \\
  --source-type db-instance --source-identifier <db-instance-id> \\
  --duration 1440 \\
  --query 'Events[].[Date,Message]' --output text`,
      description: 'RDS logs operational events for 14 days: Multi-AZ failovers with their reason, storage full, backup start/finish, parameter changes. This is the first place to look when an application saw a connection blip.',
      flags: [
        ['--duration', 'Minutes back from now (max 14 days = 20160).'],
        ['--source-type', 'db-instance, db-cluster, db-snapshot, db-parameter-group, db-security-group.'],
        ['--event-categories failover availability', '(optional) Narrow to categories.']
      ],
      output: { format: 'text', body: `2026-09-18T03:12:04.212000+00:00	Backing up DB instance
2026-09-18T03:14:41.550000+00:00	Finished DB Instance backup
2026-09-18T11:47:02.118000+00:00	Multi-AZ instance failover started.
2026-09-18T11:47:39.907000+00:00	Multi-AZ instance failover completed` },
      iam: ['rds:DescribeEvents'],
      related: ['rds-elb-asg-r53-rds-describe-instances', 'cloudwatch-describe-alarms'],
      tags: ['read-only', 'query']
    },
    {
      id: 'rds-start-stop',
      subtopic: 'rds',
      title: 'Stop and start a DB instance to save money',
      command: `aws rds stop-db-instance --db-instance-identifier <db-instance-id>
aws rds start-db-instance --db-instance-identifier <db-instance-id>`,
      description: 'Stopped instances keep storage and backups but stop compute billing. AWS restarts them automatically after seven days, so this is for dev/test, not a substitute for deletion.',
      flags: [
        ['stop-db-instance --db-snapshot-identifier', '(optional) Snapshot before stopping.'],
        ['Aurora', 'Use `stop-db-cluster` / `start-db-cluster`. Multi-AZ DB clusters and read-replica sources cannot be stopped.']
      ],
      output: { format: 'json', body: `{
    "DBInstance": {
        "DBInstanceIdentifier": "staging-db",
        "DBInstanceClass": "db.t4g.medium",
        "Engine": "postgres",
        "DBInstanceStatus": "stopping"
    }
}` },
      iam: ['rds:StopDBInstance', 'rds:StartDBInstance'],
      related: ['rds-elb-asg-r53-rds-describe-instances', 'cost-get-cost-and-usage'],
      tags: ['mutating', 'cost']
    },
    {
      id: 'rds-auth-token',
      subtopic: 'rds',
      title: 'Generate an IAM database authentication token',
      command: `PGPASSWORD=$(aws rds generate-db-auth-token \\
  --hostname <db-instance-id>.abcdefghijkl.us-east-1.rds.amazonaws.com \\
  --port 5432 --username <db-user>) \\
psql "host=<db-instance-id>.abcdefghijkl.us-east-1.rds.amazonaws.com port=5432 dbname=app user=<db-user> sslmode=require"`,
      description: 'With IAM auth enabled on the instance and a DB user granted `rds_iam`, the token replaces the password for 15 minutes. No secret to store or rotate; access is governed by an IAM policy on `rds-db:connect`.',
      flags: [
        ['--hostname / --port / --username', 'Must match the connection exactly; the token is a signed URL for that endpoint.'],
        ['--region', '(optional) Needed if the instance is in a different region than your default.']
      ],
      output: { format: 'plain', body: `psql (16.4)
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)
Type "help" for help.

app=>` },
      iam: ['rds-db:connect'],
      related: ['ssm-port-forward-remote', 'secrets-kms-get-secret-value'],
      tags: ['read-only', 'security']
    },
    {
      id: 'elb-describe',
      subtopic: 'elb',
      title: 'List load balancers with DNS name, scheme and state',
      command: `aws elbv2 describe-load-balancers \\
  --query 'LoadBalancers[].[LoadBalancerName,Type,Scheme,State.Code,DNSName]' \\
  --output table`,
      description: 'ALBs and NLBs together. The DNS name is what Route 53 aliases point at; `internal` scheme means no public IP.',
      flags: [
        ['--names <lb-name>', '(optional) Specific balancers.'],
        ['describe-listeners --load-balancer-arn <lb-arn>', 'Follow-up: ports, protocols, certificates and default actions.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------------------------------------
|                                               DescribeLoadBalancers                                                |
+------------+---------------+-------------------+----------+--------------------------------------------------------+
|  prod-api  |  application  |  internet-facing  |  active  |  prod-api-1234567890.us-east-1.elb.amazonaws.com       |
|  prod-mq   |  network      |  internal         |  active  |  prod-mq-0a1b2c3d4e5f6789.elb.us-east-1.amazonaws.com  |
+------------+---------------+-------------------+----------+--------------------------------------------------------+` },
      iam: ['elasticloadbalancing:DescribeLoadBalancers'],
      related: ['rds-elb-asg-r53-elb-target-health', 'rds-elb-asg-r53-r53-list-records'],
      tags: ['read-only', 'query']
    },
    {
      id: 'elb-target-health',
      subtopic: 'elb',
      title: 'Check target health for a target group',
      command: `aws elbv2 describe-target-health \\
  --target-group-arn <target-group-arn> \\
  --query 'TargetHealthDescriptions[].[Target.Id,Target.Port,TargetHealth.State,TargetHealth.Reason,TargetHealth.Description]' \\
  --output text`,
      description: 'The reason and description explain *why* a target is unhealthy: failed health checks, wrong port, deregistering, or an AZ mismatch. Find the ARN with `describe-target-groups --names <tg-name>`.',
      flags: [
        ['TargetHealth.Reason', '`Target.FailedHealthChecks`, `Target.Timeout`, `Target.ResponseCodeMismatch`, `Target.NotRegistered`, `Elb.RegistrationInProgress`.'],
        ['--targets Id=<instance-id>', '(optional) One target.']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	8080	healthy	None	None
i-0123456789abcdef0	8080	unhealthy	Target.ResponseCodeMismatch	Health checks failed with these codes: [503]` },
      iam: ['elasticloadbalancing:DescribeTargetHealth'],
      related: ['rds-elb-asg-r53-elb-register', 'rds-elb-asg-r53-elb-describe'],
      tags: ['read-only', 'query']
    },
    {
      id: 'elb-register',
      subtopic: 'elb',
      title: 'Drain and re-add a target (register / deregister)',
      command: `aws elbv2 deregister-targets --target-group-arn <target-group-arn> --targets Id=<instance-id>
# ... maintenance ...
aws elbv2 register-targets --target-group-arn <target-group-arn> --targets Id=<instance-id>,Port=8080`,
      description: 'Deregistering starts connection draining (`deregistration_delay.timeout_seconds`, default 300 s) so in-flight requests finish. If the instance is in an Auto Scaling group, prefer `set-instance-health` or standby so the ASG does not fight you.',
      flags: [
        ['--targets Id=…,Port=…', 'Port is optional when the target group has a default port. For IP targets use the IP as Id; for Lambda the function ARN.'],
        ['modify-target-group-attributes --attributes Key=deregistration_delay.timeout_seconds,Value=30', 'Shorten draining for faster deploys.']
      ],
      output: { format: 'none', body: '' },
      iam: ['elasticloadbalancing:DeregisterTargets', 'elasticloadbalancing:RegisterTargets'],
      related: ['rds-elb-asg-r53-elb-target-health', 'rds-elb-asg-r53-asg-describe'],
      tags: ['mutating']
    },
    {
      id: 'asg-describe',
      subtopic: 'asg',
      title: 'List Auto Scaling groups with capacity and instance count',
      command: `aws autoscaling describe-auto-scaling-groups \\
  --query 'AutoScalingGroups[].{Name:AutoScalingGroupName,Min:MinSize,Desired:DesiredCapacity,Max:MaxSize,InService:length(Instances[?LifecycleState==\`InService\`]),LT:LaunchTemplate.LaunchTemplateName,LTVer:LaunchTemplate.Version}' \\
  --output table`,
      description: 'Desired vs InService is the health signal: if they differ for long, launches are failing (check `describe-scaling-activities`). `LTVer` of `$Latest` or `$Default` tells you how template changes roll out.',
      flags: [
        ['--auto-scaling-group-names <asg-name>', '(optional) Specific groups.'],
        ['length(Instances[?LifecycleState==`InService`])', 'Counts healthy, in-service members.']
      ],
      output: { format: 'table', body: `-----------------------------------------------------------------------------------------
|                               DescribeAutoScalingGroups                               |
+-----------+-------------+-------------+-----------+-------+-------+-------------------+
|  Desired  |  InService  |      LT     |   LTVer   |  Max  |  Min  |        Name       |
+-----------+-------------+-------------+-----------+-------+-------+-------------------+
|  4        |  4          |  web-lt     |  $Latest  |  8    |  2    |  prod-web-asg     |
|  2        |  1          |  worker-lt  |  12       |  6    |  2    |  prod-worker-asg  |
+-----------+-------------+-------------+-----------+-------+-------+-------------------+` },
      iam: ['autoscaling:DescribeAutoScalingGroups'],
      related: ['rds-elb-asg-r53-asg-set-desired', 'rds-elb-asg-r53-asg-activities'],
      tags: ['read-only', 'query']
    },
    {
      id: 'asg-set-desired',
      subtopic: 'asg',
      title: 'Scale a group manually (desired, or min/max too)',
      command: `aws autoscaling set-desired-capacity --auto-scaling-group-name <asg-name> --desired-capacity 6 --honor-cooldown
# change the bounds as well:
aws autoscaling update-auto-scaling-group --auto-scaling-group-name <asg-name> --min-size 2 --max-size 10 --desired-capacity 6`,
      description: '`set-desired-capacity` is the quick scale-out/in; `update-auto-scaling-group` is for changing limits, launch template version, health check type or grace period. Desired must stay within min and max.',
      flags: [
        ['--honor-cooldown', 'Reject the change if a cooldown from a previous scaling activity is still running.'],
        ['update-auto-scaling-group --launch-template LaunchTemplateName=…,Version=…', 'Point at a new template version (existing instances are not replaced; see instance refresh).'],
        ['--health-check-type ELB --health-check-grace-period 300', 'Use load balancer health so unhealthy targets get replaced.']
      ],
      output: { format: 'none', body: '' },
      iam: ['autoscaling:SetDesiredCapacity', 'autoscaling:UpdateAutoScalingGroup'],
      related: ['rds-elb-asg-r53-asg-describe', 'rds-elb-asg-r53-asg-refresh'],
      tags: ['mutating']
    },
    {
      id: 'asg-refresh',
      subtopic: 'asg',
      title: 'Roll out a new launch template version with an instance refresh',
      command: `aws autoscaling start-instance-refresh \\
  --auto-scaling-group-name <asg-name> \\
  --preferences MinHealthyPercentage=90,InstanceWarmup=120,SkipMatching=true \\
  --desired-configuration 'LaunchTemplate={LaunchTemplateName=<launch-template-name>,Version=$Latest}'
aws autoscaling describe-instance-refreshes --auto-scaling-group-name <asg-name> \\
  --query 'InstanceRefreshes[0].{Status:Status,Pct:PercentageComplete,Remaining:InstancesToUpdate,Reason:StatusReason}'`,
      description: 'Replaces instances in batches while keeping at least the minimum healthy percentage in service. `SkipMatching` leaves instances already on the target configuration alone. Cancel with `cancel-instance-refresh`; enable `AutoRollback=true` to revert on failure.',
      flags: [
        ['MinHealthyPercentage', 'Lower means faster, riskier rollouts. `MaxHealthyPercentage` (100–200) allows launching before terminating.'],
        ['InstanceWarmup', 'Seconds a new instance must be InService before it counts as healthy.'],
        ['--desired-configuration', 'Template version to converge on; also updates the group\'s configuration.']
      ],
      output: { format: 'json', body: `{
    "Status": "InProgress",
    "Pct": 50,
    "Remaining": 2,
    "Reason": null
}` },
      iam: ['autoscaling:StartInstanceRefresh', 'autoscaling:DescribeInstanceRefreshes', 'ec2:RunInstances', 'iam:PassRole'],
      related: ['rds-elb-asg-r53-asg-set-desired', 'ec2-ami-latest-al2023'],
      tags: ['mutating']
    },
    {
      id: 'asg-activities',
      subtopic: 'asg',
      title: 'Why did the group scale (or fail to)? Scaling activities',
      command: `aws autoscaling describe-scaling-activities \\
  --auto-scaling-group-name <asg-name> --max-items 10 \\
  --query 'Activities[].[StartTime,StatusCode,Description,Cause]' \\
  --output text`,
      description: 'Every launch and termination with its cause: alarm-driven policy, scheduled action, health check replacement, manual change. Failed launches show the EC2 error (`InsufficientInstanceCapacity`, `Client.InternalError` for KMS issues).',
      flags: [
        ['--include-deleted-groups', '(optional) See activity for a group that no longer exists.'],
        ['StatusCode', 'Successful, Failed, Cancelled, InProgress, …']
      ],
      output: { format: 'text', body: `2026-09-18T15:10:22.412000+00:00	Successful	Launching a new EC2 instance: i-0a1b2c3d4e5f67890	At 2026-09-18T15:09:58Z a monitor alarm prod-web-cpu-high in state ALARM triggered policy scale-out changing the desired capacity from 4 to 5.
2026-09-18T11:47:40.001000+00:00	Failed	Launching a new EC2 instance. Status Reason: We currently do not have sufficient m5.large capacity in the Availability Zone you requested (us-east-1a). Launching EC2 instance failed.	At 2026-09-18T11:47:31Z an instance was taken out of service in response to an ELB system health check failure.` },
      iam: ['autoscaling:DescribeScalingActivities'],
      related: ['rds-elb-asg-r53-asg-describe', 'cloudwatch-put-metric-alarm'],
      tags: ['read-only', 'query']
    },
    {
      id: 'r53-list-zones',
      subtopic: 'route53',
      title: 'List hosted zones with IDs and record counts',
      command: `aws route53 list-hosted-zones \\
  --query 'HostedZones[].[Name,Id,Config.PrivateZone,ResourceRecordSetCount]' \\
  --output table`,
      description: 'Zone IDs are needed by every other Route 53 command. The ID comes back as `/hostedzone/Z…`; both forms are accepted as input.',
      flags: [
        ['list-hosted-zones-by-name --dns-name example.com', 'Alternative when you know the name.'],
        ['Config.PrivateZone', 'Private zones resolve only inside associated VPCs.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------
|                            ListHostedZones                            |
+----------------+-------------------------------------+---------+------+
|  example.com.  |  /hostedzone/Z0123456789ABCDEFGHIJ  |  False  |  14  |
|  internal.     |  /hostedzone/ZABCDEFGHIJ0123456789  |  True   |  37  |
+----------------+-------------------------------------+---------+------+` },
      iam: ['route53:ListHostedZones'],
      related: ['rds-elb-asg-r53-r53-list-records', 'rds-elb-asg-r53-r53-upsert'],
      tags: ['read-only', 'query']
    },
    {
      id: 'r53-list-records',
      subtopic: 'route53',
      title: 'Find records by name or type in a zone',
      command: `aws route53 list-resource-record-sets \\
  --hosted-zone-id <hosted-zone-id> \\
  --query "ResourceRecordSets[?Type=='A' || Type=='CNAME'].[Name,Type,TTL,ResourceRecords[0].Value,AliasTarget.DNSName]" \\
  --output text`,
      description: 'Alias records (to ALBs, CloudFront, S3) have no TTL or `ResourceRecords`; their target is under `AliasTarget`. Showing both columns covers either kind.',
      flags: [
        ['--start-record-name api.example.com --start-record-type A --max-items 1', '(optional) Jump straight to one record.'],
        ['Name', 'Always fully qualified with a trailing dot.']
      ],
      output: { format: 'text', body: `example.com.	A	None	None	prod-api-1234567890.us-east-1.elb.amazonaws.com.
api.example.com.	A	None	None	prod-api-1234567890.us-east-1.elb.amazonaws.com.
www.example.com.	CNAME	300	example.com.	None` },
      iam: ['route53:ListResourceRecordSets'],
      related: ['rds-elb-asg-r53-r53-upsert', 'rds-elb-asg-r53-elb-describe'],
      tags: ['read-only', 'query']
    },
    {
      id: 'r53-upsert',
      subtopic: 'route53',
      title: 'Create or update a record (UPSERT) and wait for propagation',
      command: `CHANGE_ID=$(aws route53 change-resource-record-sets \\
  --hosted-zone-id <hosted-zone-id> \\
  --change-batch '{
    "Comment": "point api at new lb",
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "AliasTarget": {"HostedZoneId": "Z35SXDOTRQ7X7K", "DNSName": "prod-api-1234567890.us-east-1.elb.amazonaws.com", "EvaluateTargetHealth": true}
      }
    }]
  }' --query ChangeInfo.Id --output text)
aws route53 wait resource-record-sets-changed --id "$CHANGE_ID" && echo INSYNC`,
      description: 'UPSERT creates or replaces the record in one atomic change batch. The waiter polls `get-change` until the status is `INSYNC`, meaning all Route 53 name servers have the change (typically under 60 s).',
      flags: [
        ['AliasTarget.HostedZoneId', 'The **load balancer\'s** zone ID (from `elbv2 describe-load-balancers --query LoadBalancers[].CanonicalHostedZoneId`), not your zone.'],
        ['Non-alias records', 'Use `"TTL": 300, "ResourceRecords": [{"Value": "10.0.1.23"}]` instead of `AliasTarget`.'],
        ['"Action": "DELETE"', 'Must match the existing record exactly (all values and TTL).']
      ],
      output: { format: 'plain', body: `INSYNC` },
      iam: ['route53:ChangeResourceRecordSets', 'route53:GetChange'],
      related: ['rds-elb-asg-r53-r53-list-records', 'rds-elb-asg-r53-r53-test-dns'],
      tags: ['mutating', 'waiter']
    },
    {
      id: 'r53-test-dns',
      subtopic: 'route53',
      title: 'Ask Route 53 what it would answer for a name',
      command: `aws route53 test-dns-answer \\
  --hosted-zone-id <hosted-zone-id> \\
  --record-name api.example.com \\
  --record-type A \\
  --query '{Answer:RecordData,Type:RecordType,Code:ResponseCode}'`,
      description: 'Resolves directly against the zone\'s authoritative servers, bypassing caches and your resolver. Use it to confirm a change before TTLs expire elsewhere, or to test geolocation/weighted routing with `--resolver-ip` and `--edns0-client-subnet-ip`.',
      flags: [
        ['--resolver-ip / --edns0-client-subnet-ip', '(optional) Simulate a client location for geo or latency records.'],
        ['RecordData', 'For aliases, the resolved target addresses.']
      ],
      output: { format: 'json', body: `{
    "Answer": [
        "203.0.113.20",
        "203.0.113.21"
    ],
    "Type": "A",
    "Code": "NOERROR"
}` },
      iam: ['route53:TestDNSAnswer'],
      related: ['rds-elb-asg-r53-r53-upsert', 'rds-elb-asg-r53-r53-list-records'],
      tags: ['read-only']
    }
  ]
});
