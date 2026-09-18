/* Topic: GovCloud notes */
AWSCHEAT.register({
  id: 'govcloud',
  title: 'GovCloud notes',
  order: 16,
  intro: 'AWS GovCloud (US) is a separate partition: `aws-us-gov` ARNs, two regions (`us-gov-west-1`, `us-gov-east-1`), its own IAM identities and endpoints, and no cross-partition role assumption. The same CLI works; the differences are in configuration and in what you expect to find.',
  subtopics: [
    { id: 'partition', title: 'Partition & ARNs' },
    { id: 'endpoints', title: 'Regions & FIPS endpoints' },
    { id: 'availability', title: 'Service availability' },
    { id: 'credentials', title: 'Credentials & SSO' }
  ],
  cards: [
    {
      id: 'caller-identity',
      subtopic: 'partition',
      title: 'Confirm you are in GovCloud (partition in the ARN)',
      command: `aws sts get-caller-identity --profile <gov-profile>`,
      description: 'The ARN partition is the tell: `arn:aws-us-gov:` means GovCloud. Account IDs are different from any commercial account, even the one that was used to sign up for GovCloud.',
      flags: [
        ['--profile', 'A profile whose region is `us-gov-west-1` or `us-gov-east-1` and whose credentials were issued by the GovCloud account.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEGOVID:alice",
    "Account": "123456789012",
    "Arn": "arn:aws-us-gov:sts::123456789012:assumed-role/PowerUserAccess/alice"
}` },
      note: { type: 'gotcha', text: 'Commercial credentials against a GovCloud region fail with `InvalidClientTokenId` (or `UnrecognizedClientException` for some services). That error is not a typo in the key; it is the wrong partition.' },
      iam: [],
      related: ['sts-get-caller-identity', 'govcloud-profile', 'govcloud-arns'],
      tags: ['read-only', 'govcloud']
    },
    {
      id: 'arns',
      subtopic: 'partition',
      title: 'Build partition-aware ARNs in scripts',
      command: `PARTITION=$(aws sts get-caller-identity --query Arn --output text | cut -d: -f2)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "arn:$PARTITION:iam::$ACCOUNT:role/deploy"
aws iam attach-role-policy --role-name <role-name> \\
  --policy-arn "arn:$PARTITION:iam::aws:policy/AmazonSSMManagedInstanceCore"`,
      description: 'Every hard-coded `arn:aws:` breaks in GovCloud (and in China, `aws-cn`). Deriving the partition from the caller identity keeps one script working in every partition. AWS-managed policy ARNs also change partition.',
      flags: [
        ['cut -d: -f2', 'Second colon-separated field of the ARN is the partition.'],
        ['arn:$PARTITION:iam::aws:policy/…', 'AWS-managed policies exist in each partition under that partition\'s ARN prefix.']
      ],
      output: { format: 'plain', body: `arn:aws-us-gov:iam::123456789012:role/deploy` },
      iam: ['sts:GetCallerIdentity', 'iam:AttachRolePolicy'],
      related: ['govcloud-caller-identity', 'iam-create-role', 'scripting-loop-profiles'],
      tags: ['read-only', 'govcloud', 'scripting']
    },
    {
      id: 'regions',
      subtopic: 'endpoints',
      title: 'The two GovCloud regions',
      command: `aws ec2 describe-regions --profile <gov-profile> --query 'Regions[].[RegionName,Endpoint]' --output table`,
      description: 'From inside GovCloud, `describe-regions` returns only the GovCloud regions. Global services (IAM, STS global endpoint, Route 53, CloudFront-equivalents) are anchored in `us-gov-west-1`, so that is where CloudTrail records global-service events.',
      flags: [
        ['--query Regions[].[RegionName,Endpoint]', 'Region name and EC2 endpoint hostname.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------
|                   DescribeRegions                   |
+-----------------+-----------------------------------+
|  us-gov-east-1  |  ec2.us-gov-east-1.amazonaws.com  |
|  us-gov-west-1  |  ec2.us-gov-west-1.amazonaws.com  |
+-----------------+-----------------------------------+` },
      iam: ['ec2:DescribeRegions'],
      related: ['setup-regions-table', 'govcloud-fips-endpoints'],
      tags: ['read-only', 'govcloud', 'query']
    },
    {
      id: 'fips-endpoints',
      subtopic: 'endpoints',
      title: 'Force FIPS 140-validated endpoints',
      command: `# per profile (recommended):
aws configure set use_fips_endpoint true --profile <gov-profile>
# per shell:
export AWS_USE_FIPS_ENDPOINT=true
# verify which host a call hits:
aws s3api list-buckets --profile <gov-profile> --debug 2>&1 | grep -m1 -o 'https://[a-z0-9.-]*amazonaws.com'`,
      description: 'With the setting on, the CLI resolves each service to its `-fips` hostname (e.g. `s3-fips.us-gov-west-1.amazonaws.com`, `ec2.us-gov-west-1.amazonaws.com` which is already FIPS). Services with no FIPS endpoint in that region fail fast with a clear error rather than silently falling back.',
      flags: [
        ['use_fips_endpoint = true', 'Config-file key (v2.4+). Equivalent env var `AWS_USE_FIPS_ENDPOINT=true`.'],
        ['--endpoint-url https://<service>-fips.<region>.amazonaws.com', 'Manual per-command override for services the resolver does not know a FIPS endpoint for.'],
        ['--debug 2>&1 | grep', 'The debug log prints the resolved endpoint; grep the first URL.']
      ],
      output: { format: 'plain', body: `https://s3-fips.us-gov-west-1.amazonaws.com` },
      note: { type: 'info', text: 'Pair with `use_dualstack_endpoint` only if you need IPv6; the two settings combine to `<service>-fips.dualstack…` hostnames where supported. Commercial regions also have FIPS endpoints, so the same setting works for FedRAMP workloads outside GovCloud.' },
      iam: ['s3:ListAllMyBuckets'],
      related: ['govcloud-profile', 'setup-config-files', 'scripting-debug'],
      tags: ['mutating', 'govcloud', 'config', 'security']
    },
    {
      id: 'service-availability',
      subtopic: 'availability',
      title: 'Which services exist in a GovCloud region',
      command: `aws ssm get-parameters-by-path \\
  --path /aws/service/global-infrastructure/regions/us-gov-west-1/services \\
  --query 'Parameters[].Value' --output text | tr '\\t' '\\n' | sort > gov-services.txt
wc -l gov-services.txt
grep -c . gov-services.txt && grep -E '^(ce|budgets|organizations|inspector2)$' gov-services.txt`,
      description: 'AWS publishes the region/service matrix as public SSM parameters. Run it from any region\'s profile (commercial works too) to get the authoritative list, then check whether the service you plan to script against is there before writing the script.',
      flags: [
        ['/aws/service/global-infrastructure/regions/<region>/services', 'One parameter per available service; the value is the service name.'],
        ['/aws/service/global-infrastructure/services/<service>/regions', 'The inverse: regions where a service is offered.'],
        ['tr / sort', 'Text output puts all values on one tab-separated line; split and sort for grep.']
      ],
      output: { format: 'plain', body: `210 gov-services.txt
210
budgets
inspector2
organizations` },
      note: { type: 'gotcha', text: 'Availability is not feature parity: a service may exist with fewer instance types, no newer API operations or no console feature. Cost Explorer (`ce`) in particular is absent; billing data is viewed from the linked commercial account.' },
      iam: ['ssm:GetParametersByPath'],
      related: ['govcloud-regions', 'ec2-ami-latest-al2023'],
      tags: ['read-only', 'govcloud', 'scripting']
    },
    {
      id: 'ami-lookup',
      subtopic: 'availability',
      title: 'Find AMIs and instance types offered in GovCloud',
      command: `aws ssm get-parameter --profile <gov-profile> \\
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text
aws ec2 describe-instance-type-offerings --profile <gov-profile> \\
  --location-type availability-zone --filters Name=instance-type,Values=m7g.large,m6i.large \\
  --query 'InstanceTypeOfferings[].[InstanceType,Location]' --output text`,
      description: 'AMI IDs differ per region, so the public SSM parameter is the only portable lookup. Instance type offerings lag commercial regions; check before assuming Graviton or the newest families exist in the AZ you target.',
      flags: [
        ['/aws/service/ami-amazon-linux-latest/…', 'Same parameter path as commercial; the value is region-specific.'],
        ['describe-instance-type-offerings --location-type availability-zone', 'Where each type can be launched.']
      ],
      output: { format: 'text', body: `ami-0abcdef1234567890
m6i.large	us-gov-west-1a
m6i.large	us-gov-west-1b
m6i.large	us-gov-west-1c` },
      iam: ['ssm:GetParameter', 'ec2:DescribeInstanceTypeOfferings'],
      related: ['ec2-ami-latest-al2023', 'govcloud-service-availability'],
      tags: ['read-only', 'govcloud']
    },
    {
      id: 'profile',
      subtopic: 'credentials',
      title: 'Keep GovCloud credentials in a dedicated profile',
      command: `aws configure set aws_access_key_id <gov-access-key-id> --profile <gov-profile>
aws configure set aws_secret_access_key <gov-secret-access-key> --profile <gov-profile>
aws configure set region us-gov-west-1 --profile <gov-profile>
aws configure set use_fips_endpoint true --profile <gov-profile>
aws sts get-caller-identity --profile <gov-profile>`,
      description: 'GovCloud IAM is separate from commercial IAM: separate users, roles, keys and Identity Center instance. A dedicated profile with the region baked in prevents the classic mistake of running a commercial profile against a GovCloud endpoint or vice versa.',
      flags: [
        ['region us-gov-west-1', 'Without a GovCloud region in the profile, every command needs `--region`, and STS will happily authenticate you against commercial.'],
        ['role_arn = arn:aws-us-gov:iam::…', 'Role-based profiles work the same; the partition in the ARN must match.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AIDAEXAMPLEGOVUSER",
    "Account": "123456789012",
    "Arn": "arn:aws-us-gov:iam::123456789012:user/alice"
}` },
      note: { type: 'danger', text: 'Cross-partition `sts assume-role` is impossible: a commercial identity cannot assume a GovCloud role or the reverse. Automation that spans both needs two credential sets, typically two profiles selected by a `--profile` argument or `AWS_PROFILE`.' },
      iam: ['sts:GetCallerIdentity'],
      related: ['setup-config-files', 'govcloud-fips-endpoints', 'govcloud-sso'],
      tags: ['mutating', 'govcloud', 'config', 'security']
    },
    {
      id: 'sso',
      subtopic: 'credentials',
      title: 'IAM Identity Center (SSO) profile for GovCloud',
      command: `aws configure sso --profile <gov-profile>
# resulting ~/.aws/config section:
# [sso-session gov]
# sso_start_url = https://start.us-gov-home.awsapps.com/directory/d-0123456789
# sso_region = us-gov-west-1
# [profile gov-admin]
# sso_session = gov
# sso_account_id = 123456789012
# sso_role_name = AdministratorAccess
# region = us-gov-west-1
aws sso login --profile <gov-profile>`,
      description: 'Identity Center in GovCloud has its own start URL format under `us-gov-home.awsapps.com` and lives in `us-gov-west-1`. Everything else (`aws sso login`, token cache, `export-credentials`) behaves exactly as in commercial.',
      flags: [
        ['sso_region', 'Must be the GovCloud region hosting Identity Center, not the region you deploy to.'],
        ['sso_start_url', 'GovCloud portal URL; a commercial `*.awsapps.com/start` URL will not issue GovCloud tokens.']
      ],
      output: { format: 'plain', body: `Attempting to automatically open the SSO authorization page in your default browser.
If the browser does not open or you wish to use a different device to authorize this request, open the following URL:

https://device.sso.us-gov-west-1.amazonaws.com/

Then enter the code:

ASDF-GHJK
Successfully logged into Start URL: https://start.us-gov-home.awsapps.com/directory/d-0123456789` },
      iam: [],
      related: ['setup-sso-configure', 'setup-sso-login', 'govcloud-profile'],
      tags: ['mutating', 'govcloud', 'config', 'interactive']
    },
    {
      id: 's3-endpoint',
      subtopic: 'credentials',
      title: 'S3 in GovCloud: regional endpoints and presigned URL hosts',
      command: `aws s3 ls --profile <gov-profile>
aws s3 presign s3://<bucket>/<key> --profile <gov-profile> --expires-in 600
aws s3api get-bucket-location --bucket <bucket> --profile <gov-profile>`,
      description: 'There is no global S3 endpoint in GovCloud; every call is regional and the CLI needs the region from the profile. Presigned URLs therefore carry the GovCloud hostname, which matters for allow-lists and for clients that hard-code `s3.amazonaws.com`.',
      flags: [
        ['get-bucket-location', 'Returns `us-gov-west-1` or `us-gov-east-1`; the `LocationConstraint` is never null here.'],
        ['--endpoint-url https://s3-fips.us-gov-west-1.amazonaws.com', '(optional) Explicit FIPS endpoint when not using `use_fips_endpoint`.']
      ],
      output: { format: 'plain', body: `2025-04-12 09:15:33 example-bucket
https://example-bucket.s3-fips.us-gov-west-1.amazonaws.com/reports/q3.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260918%2Fus-gov-west-1%2Fs3%2Faws4_request&X-Amz-Date=20260918T151512Z&X-Amz-Expires=600&X-Amz-SignedHeaders=host&X-Amz-Signature=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
{
    "LocationConstraint": "us-gov-west-1"
}` },
      iam: ['s3:ListAllMyBuckets', 's3:GetObject', 's3:GetBucketLocation'],
      related: ['s3-presign', 'govcloud-fips-endpoints'],
      tags: ['read-only', 'govcloud']
    }
  ]
});
