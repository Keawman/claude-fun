/* Topic: Organizations, Config, Security Hub, GuardDuty, Inspector */
AWSCHEAT.register({
  id: 'security',
  title: 'Organizations, Config, Security Hub, GuardDuty, Inspector',
  order: 14,
  intro: 'The governance and detection services. Organizations tells you which accounts exist and what SCPs bind them; Config tracks compliance against rules; Security Hub, GuardDuty and Inspector each produce findings with their own filter syntax. All findings APIs paginate and can return thousands of rows, so always filter server-side first.',
  subtopics: [
    { id: 'organizations', title: 'Organizations' },
    { id: 'config', title: 'AWS Config' },
    { id: 'securityhub', title: 'Security Hub' },
    { id: 'guardduty', title: 'GuardDuty' },
    { id: 'inspector', title: 'Inspector' }
  ],
  cards: [
    {
      id: 'org-list-accounts',
      subtopic: 'organizations',
      title: 'List all accounts in the organization',
      command: `aws organizations list-accounts \\
  --query 'sort_by(Accounts,&Name)[].[Id,Name,Email,Status]' \\
  --output table`,
      description: 'Run from the management account or a delegated administrator. The account list is the input to every "for each account" loop; `Status` of `SUSPENDED` means closed and in the 90-day grace period.',
      flags: [
        ['list-accounts-for-parent --parent-id ou-…', 'Accounts directly under one OU.'],
        ['describe-organization', 'Org ID, master account and enabled feature set (`ALL` vs `CONSOLIDATED_BILLING`).']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------
|                              ListAccounts                             |
+----------------+--------------+----------------------------+----------+
|  123456789012  |  management  |  aws-root@example.com      |  ACTIVE  |
|  123456789012  |  prod        |  aws-prod@example.com      |  ACTIVE  |
|  123456789012  |  security    |  aws-security@example.com  |  ACTIVE  |
+----------------+--------------+----------------------------+----------+` },
      note: { type: 'info', text: 'Real output has distinct account IDs per row; this sample reuses the sanitized 123456789012.' },
      iam: ['organizations:ListAccounts'],
      related: ['security-org-list-ous', 'scripting-loop-profiles'],
      tags: ['read-only', 'query']
    },
    {
      id: 'org-list-ous',
      subtopic: 'organizations',
      title: 'Walk the OU tree from the root',
      command: `ROOT=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
aws organizations list-organizational-units-for-parent --parent-id "$ROOT" \\
  --query 'OrganizationalUnits[].[Id,Name]' --output text`,
      description: 'OUs nest; repeat the call with each OU ID as the parent to descend. `list-parents --child-id <account-id>` goes the other way, telling you which OU an account lives in.',
      flags: [
        ['list-roots', 'There is exactly one root, `r-xxxx`.'],
        ['list-parents --child-id', 'Find the OU (or root) containing an account or OU.']
      ],
      output: { format: 'text', body: `ou-abcd-11111111	Workloads
ou-abcd-22222222	Security
ou-abcd-33333333	Sandbox` },
      iam: ['organizations:ListRoots', 'organizations:ListOrganizationalUnitsForParent'],
      related: ['security-org-list-accounts', 'security-org-scps'],
      tags: ['read-only', 'scripting']
    },
    {
      id: 'org-scps',
      subtopic: 'organizations',
      title: 'Which SCPs apply to an account, and what do they say?',
      command: `aws organizations list-policies-for-target --target-id 123456789012 --filter SERVICE_CONTROL_POLICY \\
  --query 'Policies[].[Id,Name]' --output text
aws organizations describe-policy --policy-id <policy-id> --query Policy.Content --output text | jq .`,
      description: 'SCPs attached directly to the account plus those inherited from its OUs and the root. A deny in any of them wins over every IAM allow, which is why an "AccessDenied with explicit deny" that no IAM policy explains usually lives here.',
      flags: [
        ['--filter', 'SERVICE_CONTROL_POLICY, TAG_POLICY, BACKUP_POLICY, AISERVICES_OPT_OUT_POLICY, …'],
        ['describe-policy --query Policy.Content', 'The JSON document as a string; `jq .` pretty-prints.']
      ],
      output: { format: 'json', body: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeavingOrg",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "DenyDisablingSecurityServices",
      "Effect": "Deny",
      "Action": [
        "guardduty:DeleteDetector",
        "guardduty:DisassociateFromMasterAccount",
        "securityhub:DisableSecurityHub",
        "cloudtrail:StopLogging",
        "config:StopConfigurationRecorder"
      ],
      "Resource": "*"
    }
  ]
}` },
      iam: ['organizations:ListPoliciesForTarget', 'organizations:DescribePolicy'],
      related: ['security-org-list-ous', 'sts-decode-authorization-message'],
      tags: ['read-only', 'security']
    },
    {
      id: 'config-noncompliant-rules',
      subtopic: 'config',
      title: 'Config rules that currently have non-compliant resources',
      command: `aws configservice describe-compliance-by-config-rule \\
  --compliance-types NON_COMPLIANT \\
  --query 'ComplianceByConfigRules[].[ConfigRuleName,Compliance.ComplianceContributorCount.CappedCount]' \\
  --output table`,
      description: 'The compliance dashboard in one call. The count is capped at 25 per rule by the API; use the details call for the actual resources.',
      flags: [
        ['--compliance-types', 'COMPLIANT, NON_COMPLIANT, NOT_APPLICABLE, INSUFFICIENT_DATA.'],
        ['--config-rule-names <rule-name>', '(optional) Specific rules.']
      ],
      output: { format: 'table', body: `----------------------------------------------------
|          DescribeComplianceByConfigRule          |
+--------------------------------------------+-----+
|  ec2-imdsv2-check                          |  2  |
|  s3-bucket-server-side-encryption-enabled  |  1  |
|  iam-user-unused-credentials-check         |  3  |
+--------------------------------------------+-----+` },
      iam: ['config:DescribeComplianceByConfigRule'],
      related: ['security-config-rule-details', 'ec2-imdsv2-audit'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'config-rule-details',
      subtopic: 'config',
      title: 'Which resources fail a specific rule?',
      command: `aws configservice get-compliance-details-by-config-rule \\
  --config-rule-name <rule-name> \\
  --compliance-types NON_COMPLIANT \\
  --query 'EvaluationResults[].[EvaluationResultIdentifier.EvaluationResultQualifier.ResourceType,EvaluationResultIdentifier.EvaluationResultQualifier.ResourceId,ResultRecordedTime]' \\
  --output text`,
      description: 'Resource-level evaluation results with the time Config last checked. Trigger a fresh evaluation after fixing with `start-config-rules-evaluation --config-rule-names <rule-name>`.',
      flags: [
        ['--compliance-types NON_COMPLIANT', 'Only failures.'],
        ['start-config-rules-evaluation', 'Re-run the rule now instead of waiting for the next periodic or change-triggered evaluation.']
      ],
      output: { format: 'text', body: `AWS::EC2::Instance	i-0123456789abcdef0	2026-09-18T14:30:12.118000+00:00
AWS::EC2::Instance	i-0fedcba9876543210	2026-09-18T14:30:12.203000+00:00` },
      iam: ['config:GetComplianceDetailsByConfigRule'],
      related: ['security-config-noncompliant-rules', 'security-config-select'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'config-select',
      subtopic: 'config',
      title: 'Query the resource inventory with SQL (advanced queries)',
      command: `aws configservice select-resource-config \\
  --expression "SELECT resourceId, resourceType, configuration.instanceType, tags WHERE resourceType = 'AWS::EC2::Instance' AND configuration.state.name = 'running'" \\
  --query 'Results[]' --output text | jq -r '[.resourceId, .configuration.instanceType, (.tags[]? | select(.key==\\"Name\\") | .value)] | @tsv'`,
      description: 'Config keeps a configuration item for every tracked resource; the SQL-like expression queries them across the account (or across the org with `select-aggregate-resource-config --configuration-aggregator-name`). Cheaper than describe calls across many services.',
      flags: [
        ['--expression', 'Subset of SQL: SELECT/WHERE/GROUP BY/ORDER BY over `resourceId`, `resourceType`, `configuration.*`, `tags`, `relationships`.'],
        ['Results[]', 'Each result is a JSON string; `jq` parses them.']
      ],
      output: { format: 'text', body: `i-0abc123def4567890	t3.medium	web-1
i-0123456789abcdef0	m5.large	worker-1` },
      iam: ['config:SelectResourceConfig'],
      related: ['security-config-rule-details', 'ec2-describe-instances-table'],
      tags: ['read-only', 'query']
    },
    {
      id: 'securityhub-findings',
      subtopic: 'securityhub',
      title: 'New high and critical Security Hub findings',
      command: `aws securityhub get-findings \\
  --filters '{"SeverityLabel":[{"Value":"HIGH","Comparison":"EQUALS"},{"Value":"CRITICAL","Comparison":"EQUALS"}],"WorkflowStatus":[{"Value":"NEW","Comparison":"EQUALS"}],"RecordState":[{"Value":"ACTIVE","Comparison":"EQUALS"}]}' \\
  --sort-criteria Field=SeverityLabel,SortOrder=desc \\
  --max-items 20 \\
  --query 'Findings[].[Severity.Label,ProductName,Title,Resources[0].Id]' \\
  --output table`,
      description: 'Security Hub aggregates GuardDuty, Inspector, Config, Macie and partner findings in one schema (ASFF). This filter is the triage queue: active, unacknowledged, severe.',
      flags: [
        ['--filters', 'JSON of ASFF field filters; each is a list of `{Value, Comparison}` (EQUALS, PREFIX, NOT_EQUALS, …). Multiple values in one field are ORed; fields are ANDed.'],
        ['WorkflowStatus', 'NEW, NOTIFIED, RESOLVED, SUPPRESSED.'],
        ['--sort-criteria', 'Field and order; `LastObservedAt` is another useful one.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
|                                                                                  GetFindings                                                                                   |
+------------+----------------+------------------------------------------------------------------------------+-------------------------------------------------------------------+
|  CRITICAL  |  Inspector     |  CVE-2024-3094 - xz-utils                                                    |  arn:aws:ec2:us-east-1:123456789012:instance/i-0fedcba9876543210  |
|  HIGH      |  GuardDuty     |  Credentials for the EC2 instance role were used from a remote AWS account.  |  arn:aws:ec2:us-east-1:123456789012:instance/i-0123456789abcdef0  |
|  HIGH      |  Security Hub  |  EC2.8 EC2 instances should use IMDSv2                                       |  arn:aws:ec2:us-east-1:123456789012:instance/i-0123456789abcdef0  |
+------------+----------------+------------------------------------------------------------------------------+-------------------------------------------------------------------+` },
      iam: ['securityhub:GetFindings'],
      related: ['security-securityhub-update', 'security-guardduty-findings', 'security-inspector-findings'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'securityhub-update',
      subtopic: 'securityhub',
      title: 'Suppress or resolve findings in bulk',
      command: `aws securityhub batch-update-findings \\
  --finding-identifiers Id=<finding-id>,ProductArn=<product-arn> \\
  --workflow Status=SUPPRESSED \\
  --note Text="Accepted risk: isolated lab account, ticket SEC-421",UpdatedBy=alice`,
      description: 'Changes the workflow state so the finding drops out of the NEW queue, with an audit note. Get the identifiers from `get-findings --query \'Findings[].[Id,ProductArn]\'`; up to 100 per call.',
      flags: [
        ['--workflow Status=', 'NOTIFIED (someone is on it), RESOLVED (fixed), SUPPRESSED (accepted).'],
        ['--note', 'Free text plus `UpdatedBy`; required by many compliance regimes when suppressing.'],
        ['--severity Label=LOW', '(optional) Override severity for your environment.']
      ],
      output: { format: 'json', body: `{
    "ProcessedFindings": [
        {
            "Id": "arn:aws:securityhub:us-east-1:123456789012:subscription/aws-foundational-security-best-practices/v/1.0.0/EC2.8/finding/0a1b2c3d-4e5f-6789-abcd-ef0123456789",
            "ProductArn": "arn:aws:securityhub:us-east-1::product/aws/securityhub"
        }
    ],
    "UnprocessedFindings": []
}` },
      iam: ['securityhub:BatchUpdateFindings'],
      related: ['security-securityhub-findings'],
      tags: ['mutating', 'security']
    },
    {
      id: 'securityhub-controls',
      subtopic: 'securityhub',
      title: 'Failing controls for an enabled standard',
      command: `aws securityhub get-enabled-standards --query 'StandardsSubscriptions[].StandardsSubscriptionArn' --output text
aws securityhub describe-standards-controls --standards-subscription-arn <standards-subscription-arn> \\
  --query 'Controls[?ControlStatus==\`ENABLED\`].[ControlId,SeverityRating,Title]' --output text | head`,
      description: 'Lists the controls of a standard (CIS, AWS Foundational, PCI) with severity. Combine with `get-findings` filtered on `ComplianceStatus=FAILED` and `GeneratorId` to see which controls fail and where.',
      flags: [
        ['get-enabled-standards', 'Which standards this account subscribes to.'],
        ['update-standards-control --control-status DISABLED --disabled-reason "…"', 'Disable a control that does not apply (stops its findings).']
      ],
      output: { format: 'text', body: `arn:aws:securityhub:us-east-1:123456789012:subscription/aws-foundational-security-best-practices/v/1.0.0
EC2.8	HIGH	EC2 instances should use Instance Metadata Service Version 2 (IMDSv2)
IAM.4	CRITICAL	IAM root user access key should not exist
S3.8	HIGH	S3 general purpose buckets should block public access` },
      iam: ['securityhub:GetEnabledStandards', 'securityhub:DescribeStandardsControls'],
      related: ['security-securityhub-findings', 'iam-account-summary'],
      tags: ['read-only', 'security']
    },
    {
      id: 'guardduty-findings',
      subtopic: 'guardduty',
      title: 'List and read high-severity GuardDuty findings',
      command: `DETECTOR=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
IDS=$(aws guardduty list-findings --detector-id "$DETECTOR" \\
  --finding-criteria '{"Criterion":{"severity":{"Gte":7},"service.archived":{"Eq":["false"]}}}' \\
  --sort-criteria AttributeName=updatedAt,OrderBy=DESC --max-results 10 \\
  --query 'FindingIds' --output text)
aws guardduty get-findings --detector-id "$DETECTOR" --finding-ids $IDS \\
  --query 'Findings[].[Severity,Type,Resource.ResourceType,Resource.InstanceDetails.InstanceId,UpdatedAt]' --output text`,
      description: 'GuardDuty has one detector per region; findings are listed as IDs first, then fetched in batches of 50. Severity 7–8.9 is High, 9+ Critical. `Type` encodes the threat (`UnauthorizedAccess:EC2/SSHBruteForce`).',
      flags: [
        ['--finding-criteria', 'JSON criterion map: `Gte`/`Lte` for numbers, `Eq`/`Neq` lists for strings. Field names are lowerCamel paths.'],
        ['service.archived', 'Exclude findings you already archived.'],
        ['archive-findings --finding-ids', 'Acknowledge; use `create-filter --action ARCHIVE` for auto-suppression rules.']
      ],
      output: { format: 'text', body: `8.0	UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS	Instance	i-0123456789abcdef0	2026-09-18T14:52:10.417Z
7.0	Recon:EC2/PortProbeUnprotectedPort	Instance	i-0fedcba9876543210	2026-09-18T12:03:44.001Z` },
      iam: ['guardduty:ListDetectors', 'guardduty:ListFindings', 'guardduty:GetFindings'],
      related: ['security-securityhub-findings', 'cloudtrail-by-access-key', 'ec2-find-open-sgs'],
      tags: ['read-only', 'query', 'security', 'scripting']
    },
    {
      id: 'guardduty-status',
      subtopic: 'guardduty',
      title: 'Confirm GuardDuty is enabled and which protections are on',
      command: `aws guardduty get-detector --detector-id $(aws guardduty list-detectors --query 'DetectorIds[0]' --output text) \\
  --query '{Status:Status,Frequency:FindingPublishingFrequency,Features:Features[].[Name,Status]}'`,
      description: 'No detector ID means GuardDuty is off in this region. The feature list shows whether S3, EKS, Malware, RDS and Lambda protections are enabled beyond the base CloudTrail/VPC/DNS analysis.',
      flags: [
        ['FindingPublishingFrequency', 'How often updated findings go to EventBridge/Security Hub: FIFTEEN_MINUTES, ONE_HOUR, SIX_HOURS.'],
        ['update-detector --features Name=S3_DATA_EVENTS,Status=ENABLED', 'Turn a protection on.']
      ],
      output: { format: 'json', body: `{
    "Status": "ENABLED",
    "Frequency": "FIFTEEN_MINUTES",
    "Features": [
        [
            "CLOUD_TRAIL",
            "ENABLED"
        ],
        [
            "DNS_LOGS",
            "ENABLED"
        ],
        [
            "FLOW_LOGS",
            "ENABLED"
        ],
        [
            "S3_DATA_EVENTS",
            "ENABLED"
        ],
        [
            "EBS_MALWARE_PROTECTION",
            "ENABLED"
        ],
        [
            "RUNTIME_MONITORING",
            "DISABLED"
        ]
    ]
}` },
      iam: ['guardduty:ListDetectors', 'guardduty:GetDetector'],
      related: ['security-guardduty-findings', 'security-org-scps'],
      tags: ['read-only', 'security']
    },
    {
      id: 'inspector-findings',
      subtopic: 'inspector',
      title: 'Critical Inspector vulnerabilities with fix availability',
      command: `aws inspector2 list-findings \\
  --filter-criteria '{"severity":[{"comparison":"EQUALS","value":"CRITICAL"}],"findingStatus":[{"comparison":"EQUALS","value":"ACTIVE"}],"fixAvailable":[{"comparison":"EQUALS","value":"YES"}]}' \\
  --sort-criteria field=INSPECTOR_SCORE,sortOrder=DESC \\
  --max-items 20 \\
  --query 'findings[].[inspectorScore,title,resources[0].id,packageVulnerabilityDetails.vulnerablePackages[0].name,packageVulnerabilityDetails.vulnerablePackages[0].fixedInVersion]' \\
  --output text`,
      description: 'Inspector v2 continuously scans EC2 (via SSM), ECR images and Lambda for CVEs. Filtering on `fixAvailable` gives the patchable list; the fixed-in version tells you what to upgrade to.',
      flags: [
        ['--filter-criteria', 'JSON with lowerCamel field names; string filters use `comparison` EQUALS/PREFIX/NOT_EQUALS.'],
        ['resourceType', '(optional filter) AWS_EC2_INSTANCE, AWS_ECR_CONTAINER_IMAGE, AWS_LAMBDA_FUNCTION.'],
        ['list-finding-aggregations --aggregation-type PACKAGE', 'Roll-up by package instead of per resource.']
      ],
      output: { format: 'text', body: `10.0	CVE-2024-3094 - xz-utils	i-0fedcba9876543210	xz-utils	5.4.6-1.el9
9.8	CVE-2024-6387 - openssh-server	i-0fedcba9876543210	openssh-server	8.7p1-38.el9_4.4` },
      iam: ['inspector2:ListFindings'],
      related: ['security-inspector-coverage', 'ssm-inventory', 'ssm-patch-compliance'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'inspector-coverage',
      subtopic: 'inspector',
      title: 'Which resources are (not) being scanned',
      command: `aws inspector2 list-coverage \\
  --filter-criteria '{"scanStatusCode":[{"comparison":"EQUALS","value":"INACTIVE"}],"resourceType":[{"comparison":"EQUALS","value":"AWS_EC2_INSTANCE"}]}' \\
  --query 'coveredResources[].[resourceId,scanStatus.reason]' --output text`,
      description: 'A clean findings list is meaningless if half the fleet is not scanned. Inactive EC2 coverage is almost always an SSM problem: unmanaged instance, unsupported OS or stale agent.',
      flags: [
        ['scanStatusCode', 'ACTIVE or INACTIVE.'],
        ['scanStatus.reason', 'e.g. `UNMANAGED_EC2_INSTANCE`, `UNSUPPORTED_OS`, `NO_INVENTORY`, `STALE_INVENTORY`.'],
        ['list-coverage-statistics --group-by RESOURCE_TYPE', 'Counts instead of rows.']
      ],
      output: { format: 'text', body: `i-0fedcba9876543210	UNMANAGED_EC2_INSTANCE
i-0a1b2c3d4e5f67890	STALE_INVENTORY` },
      iam: ['inspector2:ListCoverage'],
      related: ['security-inspector-findings', 'ssm-describe-instance-information'],
      tags: ['read-only', 'query', 'security']
    }
  ]
});
