/* Topic: CloudFormation */
AWSCHEAT.register({
  id: 'cloudformation',
  title: 'CloudFormation',
  order: 13,
  intro: 'Deploy, watch, diff and recover. `deploy` is the high-level idempotent verb; the rest of the cards are what you reach for when a stack is stuck or you need to know what will change before it changes.',
  subtopics: [
    { id: 'deploy-validate', title: 'Deploy & validate' },
    { id: 'inspect', title: 'Inspect stacks' },
    { id: 'change-sets', title: 'Change sets' },
    { id: 'drift-detection', title: 'Drift detection' },
    { id: 'recover', title: 'Recover & delete' }
  ],
  cards: [
    {
      id: 'deploy',
      subtopic: 'deploy-validate',
      title: 'Deploy (create or update) a stack idempotently',
      command: `aws cloudformation deploy \\
  --stack-name <stack-name> \\
  --template-file template.yaml \\
  --parameter-overrides Environment=prod InstanceType=t3.medium \\
  --capabilities CAPABILITY_NAMED_IAM \\
  --tags Owner=platform \\
  --no-fail-on-empty-changeset`,
      description: 'Creates the stack if missing, otherwise creates and executes a change set. It waits for completion and exits non-zero on failure, which makes it the right verb for CI. Templates over 51 200 bytes need `--s3-bucket`.',
      flags: [
        ['--parameter-overrides', 'Key=Value pairs, or `file://params.json` in the `[{"ParameterKey":…,"ParameterValue":…}]` form.'],
        ['--capabilities', '`CAPABILITY_IAM` for IAM resources, `CAPABILITY_NAMED_IAM` when they have explicit names, `CAPABILITY_AUTO_EXPAND` for macros and nested stacks.'],
        ['--no-fail-on-empty-changeset', 'Exit 0 when nothing changed instead of failing the pipeline.'],
        ['--disable-rollback', '(optional) Keep failed resources for debugging instead of rolling back.'],
        ['--no-execute-changeset', '(optional) Create the change set and stop so it can be reviewed.']
      ],
      output: { format: 'plain', body: `Waiting for changeset to be created..
Waiting for stack create/update to complete
Successfully created/updated stack - prod-web` },
      iam: ['cloudformation:CreateChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DescribeStacks', 'cloudformation:DescribeChangeSet'],
      related: ['cloudformation-validate', 'cloudformation-stack-events-failed', 'cloudformation-create-change-set'],
      tags: ['mutating']
    },
    {
      id: 'validate',
      subtopic: 'deploy-validate',
      title: 'Validate template syntax and list its parameters',
      command: `aws cloudformation validate-template --template-body file://template.yaml \\
  --query '{Params:Parameters[].[ParameterKey,DefaultValue],Caps:Capabilities,Desc:Description}'`,
      description: 'Catches YAML/JSON errors and unknown intrinsic functions before a deploy. It does not validate resource properties; a linter such as cfn-lint does that. The `Capabilities` output tells you which `--capabilities` flag deploy will need.',
      flags: [
        ['--template-body file://', 'Local file (max 51 200 bytes). Use `--template-url https://…s3…` for larger templates.']
      ],
      output: { format: 'json', body: `{
    "Params": [
        [
            "Environment",
            "dev"
        ],
        [
            "InstanceType",
            "t3.micro"
        ]
    ],
    "Caps": [
        "CAPABILITY_NAMED_IAM"
    ],
    "Desc": "Web tier: ASG behind an ALB"
}` },
      iam: ['cloudformation:ValidateTemplate'],
      related: ['cloudformation-deploy', 'cloudformation-get-template'],
      tags: ['read-only']
    },
    {
      id: 'list-stacks',
      subtopic: 'inspect',
      title: 'List stacks with status and last update',
      command: `aws cloudformation describe-stacks \\
  --query 'Stacks[].[StackName,StackStatus,LastUpdatedTime]' \\
  --output table`,
      description: 'The active stacks in the region. Statuses ending in `_FAILED`, `ROLLBACK_COMPLETE` or `_IN_PROGRESS` are the ones needing attention. `list-stacks --stack-status-filter DELETE_COMPLETE` shows deleted ones.',
      flags: [
        ['--stack-name <stack-name>', '(optional) One stack (also works during and after deletion for ~90 days with list-stacks).'],
        ['list-stacks --stack-status-filter CREATE_FAILED ROLLBACK_COMPLETE', 'Lighter call with status filtering.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------
|                                 DescribeStacks                                 |
+----------------+--------------------------+------------------------------------+
|  prod-web      |  UPDATE_COMPLETE         |  2026-09-18T15:20:41.118000+00:00  |
|  prod-network  |  CREATE_COMPLETE         |  None                              |
|  staging-web   |  UPDATE_ROLLBACK_FAILED  |  2026-09-17T09:02:13.554000+00:00  |
+----------------+--------------------------+------------------------------------+` },
      iam: ['cloudformation:DescribeStacks'],
      related: ['cloudformation-stack-outputs', 'cloudformation-continue-rollback'],
      tags: ['read-only', 'query']
    },
    {
      id: 'stack-outputs',
      subtopic: 'inspect',
      title: 'Read stack outputs (one value, or all as a table)',
      command: `aws cloudformation describe-stacks --stack-name <stack-name> \\
  --query 'Stacks[0].Outputs[?OutputKey==\`LoadBalancerDNS\`].OutputValue' --output text
aws cloudformation describe-stacks --stack-name <stack-name> \\
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue,ExportName]' --output table`,
      description: 'Outputs are the contract between stacks and scripts: the first form feeds one value into a variable, the second shows everything including export names used by `Fn::ImportValue` in other stacks.',
      flags: [
        ['Outputs[?OutputKey==`X`].OutputValue', 'Filter to one output; text output prints the bare value.'],
        ['list-exports', 'All exported values in the region; `list-imports --export-name X` shows who depends on one.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------------------------------
|                                     DescribeStacks                                     |
+--------------------+---------------------------------------------------+---------------+
|  LoadBalancerDNS   |  prod-api-1234567890.us-east-1.elb.amazonaws.com  |  prod-web-lb  |
|  AutoScalingGroup  |  prod-web-asg                                     |  None         |
+--------------------+---------------------------------------------------+---------------+` },
      iam: ['cloudformation:DescribeStacks'],
      related: ['cloudformation-list-stacks', 'cloudformation-list-resources'],
      tags: ['read-only', 'query', 'scripting']
    },
    {
      id: 'stack-events-failed',
      subtopic: 'inspect',
      title: 'Find the failure reason in stack events',
      command: `aws cloudformation describe-stack-events --stack-name <stack-name> \\
  --query 'StackEvents[?contains(ResourceStatus, \`FAILED\`)].[Timestamp,LogicalResourceId,ResourceType,ResourceStatusReason]' \\
  --output table`,
      description: 'A rollback hides the original error under dozens of `ROLLBACK_IN_PROGRESS` lines. Filtering to `FAILED` statuses shows the resource that actually broke and the service\'s error message; the earliest one is the root cause.',
      flags: [
        ['[?contains(ResourceStatus, `FAILED`)]', 'Catches CREATE_FAILED, UPDATE_FAILED, DELETE_FAILED.'],
        ['--max-items 50', '(optional) Events are newest first; limit for big stacks.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
|                                                                                       DescribeStackEvents                                                                                       |
+------------------------------------+--------------------+------------------------------+--------------------------------------------------------------------------------------------------------+
|  2026-09-17T09:01:48.902000+00:00  |  staging-web       |  AWS::CloudFormation::Stack  |  The following resource(s) failed to update: [WebSecurityGroup].                                       |
|  2026-09-17T09:01:47.331000+00:00  |  WebSecurityGroup  |  AWS::EC2::SecurityGroup     |  Resource handler returned message: "The security group 'sg-0a1b2c3d4e5f6a7b8' has dependent objects"  |
+------------------------------------+--------------------+------------------------------+--------------------------------------------------------------------------------------------------------+` },
      iam: ['cloudformation:DescribeStackEvents'],
      related: ['cloudformation-deploy', 'cloudformation-continue-rollback'],
      tags: ['read-only', 'query']
    },
    {
      id: 'list-resources',
      subtopic: 'inspect',
      title: 'Map logical IDs to physical resource IDs',
      command: `aws cloudformation list-stack-resources --stack-name <stack-name> \\
  --query 'StackResourceSummaries[].[LogicalResourceId,ResourceType,PhysicalResourceId,ResourceStatus]' \\
  --output text`,
      description: 'The bridge from template names to real IDs you can pass to other services. `describe-stack-resource --logical-resource-id X` gives full detail for one.',
      flags: [
        ['PhysicalResourceId', 'Instance IDs, ARNs, bucket names, nested stack ARNs.']
      ],
      output: { format: 'text', body: `WebLoadBalancer	AWS::ElasticLoadBalancingV2::LoadBalancer	arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/prod-api/0123456789abcdef	UPDATE_COMPLETE
WebSecurityGroup	AWS::EC2::SecurityGroup	sg-0a1b2c3d4e5f6a7b8	UPDATE_COMPLETE
WebAutoScalingGroup	AWS::AutoScaling::AutoScalingGroup	prod-web-asg	UPDATE_COMPLETE` },
      iam: ['cloudformation:ListStackResources'],
      related: ['cloudformation-stack-outputs', 'cloudformation-drift'],
      tags: ['read-only', 'query']
    },
    {
      id: 'get-template',
      subtopic: 'inspect',
      title: 'Download the template a stack was deployed with',
      command: `aws cloudformation get-template --stack-name <stack-name> --template-stage Original --query TemplateBody --output text > deployed.yaml`,
      description: 'Recovers the source of truth when the repo and the stack have diverged. `Processed` returns the template after macros and transforms (e.g. SAM) were applied.',
      flags: [
        ['--template-stage Original|Processed', 'Before or after transforms.'],
        ['--query TemplateBody --output text', 'YAML templates come back as text; JSON templates as a JSON object (drop `--output text`).']
      ],
      output: { format: 'none', body: '' },
      iam: ['cloudformation:GetTemplate'],
      related: ['cloudformation-validate', 'cloudformation-drift'],
      tags: ['read-only']
    },
    {
      id: 'create-change-set',
      subtopic: 'change-sets',
      title: 'Preview what an update will do with a change set',
      command: `aws cloudformation create-change-set \\
  --stack-name <stack-name> --change-set-name preview-$(date +%s) \\
  --template-body file://template.yaml \\
  --parameters ParameterKey=InstanceType,ParameterValue=t3.large ParameterKey=Environment,UsePreviousValue=true \\
  --capabilities CAPABILITY_NAMED_IAM \\
  --query Id --output text`,
      description: 'A change set is a dry run that lists every resource that will be added, modified or removed, and whether a modification means replacement. Review it, then execute or delete it.',
      flags: [
        ['--parameters … UsePreviousValue=true', 'Keep a parameter\'s current value without restating it.'],
        ['--change-set-type CREATE', 'For a stack that does not exist yet.'],
        ['--include-nested-stacks', '(optional) Generate change sets for nested stacks too.']
      ],
      output: { format: 'text', body: `arn:aws:cloudformation:us-east-1:123456789012:changeSet/preview-1758208312/0a1b2c3d-4e5f-6789-abcd-ef0123456789` },
      iam: ['cloudformation:CreateChangeSet'],
      related: ['cloudformation-describe-change-set', 'cloudformation-deploy'],
      tags: ['read-only']
    },
    {
      id: 'describe-change-set',
      subtopic: 'change-sets',
      title: 'Read a change set and execute it',
      command: `aws cloudformation describe-change-set --stack-name <stack-name> --change-set-name <change-set-name> \\
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
aws cloudformation execute-change-set --stack-name <stack-name> --change-set-name <change-set-name>
aws cloudformation wait stack-update-complete --stack-name <stack-name>`,
      description: '`Replacement: True` is the line that matters: that resource will be deleted and recreated (new ID, data loss for databases). `Conditional` means it depends on a value not known until execution.',
      flags: [
        ['Replacement', '`True`, `False` or `Conditional`. Check `Details[].CausingEntity` to see which property triggers it.'],
        ['execute-change-set', 'Applies the change set; all other change sets for the stack are deleted.'],
        ['delete-change-set', 'Discard without applying.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------------------
|                                 DescribeChangeSet                                 |
+----------+-----------------------+--------------------------------------+---------+
|  Modify  |  WebLaunchTemplate    |  AWS::EC2::LaunchTemplate            |  False  |
|  Modify  |  WebAutoScalingGroup  |  AWS::AutoScaling::AutoScalingGroup  |  False  |
|  Add     |  WebAlarmHighCPU      |  AWS::CloudWatch::Alarm              |  None   |
+----------+-----------------------+--------------------------------------+---------+` },
      iam: ['cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DescribeStacks'],
      related: ['cloudformation-create-change-set', 'output-query-waiters'],
      tags: ['mutating', 'waiter']
    },
    {
      id: 'drift',
      subtopic: 'drift-detection',
      title: 'Detect drift and list resources changed outside CloudFormation',
      command: `DRIFT_ID=$(aws cloudformation detect-stack-drift --stack-name <stack-name> --query StackDriftDetectionId --output text)
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id "$DRIFT_ID" \\
  --query '{Status:DetectionStatus,Drift:StackDriftStatus,Drifted:DriftedStackResourceCount}'
aws cloudformation describe-stack-resource-drifts --stack-name <stack-name> \\
  --stack-resource-drift-status-filters MODIFIED DELETED \\
  --query 'StackResourceDrifts[].[LogicalResourceId,StackResourceDriftStatus,PropertyDifferences[].PropertyPath]' --output text`,
      description: 'Drift detection compares live resource configuration with the template. It runs asynchronously (seconds to minutes); the status call tells you when it is done, and the drifts call lists which properties differ.',
      flags: [
        ['detect-stack-drift', 'Starts detection. Not every resource type supports it; unsupported ones are skipped.'],
        ['--stack-resource-drift-status-filters', 'IN_SYNC, MODIFIED, DELETED, NOT_CHECKED.'],
        ['PropertyDifferences', 'Expected vs actual values per JSON path.']
      ],
      output: { format: 'plain', body: `{
    "Status": "DETECTION_COMPLETE",
    "Drift": "DRIFTED",
    "Drifted": 1
}
WebSecurityGroup	MODIFIED	/SecurityGroupIngress` },
      note: { type: 'info', text: 'Drift is informational: fixing it means either updating the template to match reality or re-running the stack update to overwrite the manual change.' },
      iam: ['cloudformation:DetectStackDrift', 'cloudformation:DescribeStackDriftDetectionStatus', 'cloudformation:DescribeStackResourceDrifts'],
      related: ['cloudformation-list-resources', 'security-config-noncompliant-rules'],
      tags: ['read-only', 'security']
    },
    {
      id: 'continue-rollback',
      subtopic: 'recover',
      title: 'Escape UPDATE_ROLLBACK_FAILED',
      command: `aws cloudformation continue-update-rollback \\
  --stack-name <stack-name> \\
  --resources-to-skip <logical-resource-id>`,
      description: 'When a rollback itself fails (usually because a resource was changed or deleted by hand), the stack is stuck. Fix the underlying resource if you can; otherwise skip it so the rollback can finish, then reconcile with a new update.',
      flags: [
        ['--resources-to-skip', 'Logical IDs the rollback should treat as rolled back. Nested stack resources use `NestedStack.Resource` notation.'],
        ['cancel-update-stack', 'The equivalent for a stack stuck in `UPDATE_IN_PROGRESS`.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'gotcha', text: 'Skipping a resource tells CloudFormation to assume it is in its pre-update state. If it is not, the next update may fail again or, worse, succeed against the wrong resource.' },
      iam: ['cloudformation:ContinueUpdateRollback'],
      related: ['cloudformation-stack-events-failed', 'cloudformation-list-stacks'],
      tags: ['mutating']
    },
    {
      id: 'delete-stack',
      subtopic: 'recover',
      title: 'Delete a stack and wait, optionally retaining resources',
      command: `aws cloudformation delete-stack --stack-name <stack-name>
aws cloudformation wait stack-delete-complete --stack-name <stack-name>
# if a previous delete failed on specific resources:
aws cloudformation delete-stack --stack-name <stack-name> --retain-resources <logical-resource-id>`,
      description: 'Deletes every resource the stack created, honouring `DeletionPolicy: Retain` in the template. `--retain-resources` is only allowed for a stack in `DELETE_FAILED` and leaves those resources orphaned but intact.',
      flags: [
        ['wait stack-delete-complete', 'Exits 255 if the delete fails; check events for which resource blocked it (non-empty S3 buckets are the classic).'],
        ['--retain-resources', 'Logical IDs to keep. Works only when the stack is `DELETE_FAILED`.'],
        ['--deletion-mode FORCE_DELETE_STACK', '(newer CLI) Force deletion of a `DELETE_FAILED` stack, retaining what cannot be deleted.']
      ],
      output: { format: 'none', body: '' },
      note: { type: 'danger', text: 'Termination protection (`update-termination-protection --enable-termination-protection`) blocks this call and is worth enabling on every production stack.' },
      iam: ['cloudformation:DeleteStack', 'cloudformation:DescribeStacks'],
      related: ['cloudformation-stack-events-failed', 's3-rm'],
      tags: ['destructive', 'waiter']
    }
  ]
});
