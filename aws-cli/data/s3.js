/* Topic: S3 */
AWSCHEAT.register({
  id: 's3',
  title: 'S3',
  order: 7,
  intro: 'Two command families: `aws s3` is the high-level, rsync-like interface (ls, cp, sync) that handles multipart and recursion for you; `aws s3api` maps one-to-one onto the API and is where bucket configuration lives.',
  subtopics: [
    { id: 'objects', title: 'ls / cp / mv / rm' },
    { id: 'sync-filters', title: 'sync & filters' },
    { id: 'urls-metadata', title: 'Presigned URLs & metadata' },
    { id: 'bucket-config', title: 'Bucket configuration (s3api)' },
    { id: 'multipart', title: 'Multipart cleanup' }
  ],
  cards: [
    {
      id: 'ls',
      subtopic: 'objects',
      title: 'List a prefix with sizes and totals',
      command: `aws s3 ls s3://<bucket>/<prefix>/ --human-readable --summarize`,
      description: 'Lists one "directory" level. The trailing slash matters: without it you match every key that starts with the string. `--recursive` walks the whole prefix.',
      flags: [
        ['--human-readable', 'Sizes as KiB/MiB/GiB instead of bytes.'],
        ['--summarize', 'Append total object count and size.'],
        ['--recursive', 'All keys under the prefix, one line each.']
      ],
      output: { format: 'plain', body: `                           PRE 2026/
2026-09-18 14:05:12  180.0 KiB app-14.log.gz
2026-09-18 13:05:09  173.1 KiB app-13.log.gz
2026-09-18 12:05:14  185.6 KiB app-12.log.gz

Total Objects: 3
   Total Size: 538.7 KiB` },
      iam: ['s3:ListBucket'],
      related: ['s3-list-buckets', 's3-largest-objects'],
      tags: ['read-only']
    },
    {
      id: 'list-buckets',
      subtopic: 'objects',
      title: 'List all buckets with creation date',
      command: `aws s3api list-buckets \\
  --query 'Buckets[].[Name,CreationDate]' \\
  --output table`,
      description: 'Bucket names are global, but `list-buckets` returns every bucket the account owns regardless of region. Follow with `get-bucket-location` to learn where each one lives.',
      flags: [
        ['--query Buckets[].[Name,CreationDate]', 'Two columns; `Owner` is dropped.'],
        ['--bucket-region us-west-2', '(optional, newer CLI) Server-side filter by region.']
      ],
      output: { format: 'table', body: `----------------------------------------------------------------
|                         ListBuckets                          |
+--------------------------------+-----------------------------+
|  example-bucket                |  2025-04-12T09:15:33+00:00  |
|  example-bucket-logs           |  2026-01-08T17:40:02+00:00  |
|  example-bucket-cfn-artifacts  |  2025-06-01T12:00:41+00:00  |
+--------------------------------+-----------------------------+` },
      iam: ['s3:ListAllMyBuckets'],
      related: ['s3-ls', 's3-public-access-block'],
      tags: ['read-only', 'query']
    },
    {
      id: 'cp',
      subtopic: 'objects',
      title: 'Upload and download objects (with KMS encryption)',
      command: `aws s3 cp ./report.csv s3://<bucket>/reports/ --sse aws:kms --sse-kms-key-id alias/<key-alias>
aws s3 cp s3://<bucket>/reports/report.csv ./
aws s3 cp s3://<bucket>/reports/ ./reports/ --recursive`,
      description: '`cp` handles multipart uploads, retries and content-type detection automatically. Directions are inferred from which argument starts with `s3://`. Use `-` as the local path to stream to/from stdout/stdin.',
      flags: [
        ['--sse aws:kms --sse-kms-key-id', 'Server-side encryption with a specific KMS key (the bucket default applies otherwise).'],
        ['--recursive', 'Copy a whole prefix or directory.'],
        ['--storage-class STANDARD_IA|GLACIER_IR|…', '(optional) Set the storage class on upload.'],
        ['--expected-size', '(optional) Required when streaming >50 GiB from stdin so multipart part sizes can be computed.']
      ],
      output: { format: 'plain', body: `upload: ./report.csv to s3://example-bucket/reports/report.csv
download: s3://example-bucket/reports/report.csv to ./report.csv
download: s3://example-bucket/reports/report.csv to reports/report.csv
download: s3://example-bucket/reports/summary.json to reports/summary.json` },
      iam: ['s3:PutObject', 's3:GetObject', 's3:ListBucket', 'kms:GenerateDataKey', 'kms:Decrypt'],
      related: ['s3-sync', 's3-mv', 's3-bucket-encryption'],
      tags: ['mutating']
    },
    {
      id: 'mv',
      subtopic: 'objects',
      title: 'Move (rename) objects within or between buckets',
      command: `aws s3 mv s3://<bucket>/incoming/ s3://<bucket>/processed/ --recursive --exclude "*" --include "*.csv"`,
      description: 'S3 has no rename; `mv` copies then deletes. It is not atomic: a failure mid-way leaves some objects in each place, so idempotent consumers matter.',
      flags: [
        ['--recursive', 'Apply to every matching key under the prefix.'],
        ['--exclude "*" --include "*.csv"', 'Filters are evaluated in order; exclude everything, then include what you want.']
      ],
      output: { format: 'plain', body: `move: s3://example-bucket/incoming/2026-09-18.csv to s3://example-bucket/processed/2026-09-18.csv
move: s3://example-bucket/incoming/2026-09-17.csv to s3://example-bucket/processed/2026-09-17.csv` },
      iam: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      related: ['s3-cp', 's3-rm'],
      tags: ['mutating']
    },
    {
      id: 'rm',
      subtopic: 'objects',
      title: 'Delete objects under a prefix (with a dry run first)',
      command: `aws s3 rm s3://<bucket>/tmp/ --recursive --dryrun
aws s3 rm s3://<bucket>/tmp/ --recursive --exclude "*" --include "*.tmp"`,
      description: 'Deletes every object matched. On a versioned bucket this only adds delete markers; the data is still billed until versions are expired or removed with `s3api delete-objects`.',
      flags: [
        ['--dryrun', 'Print what would be deleted. Always run it first on a recursive delete.'],
        ['--recursive', 'Without it, `rm` deletes exactly one key.'],
        ['--exclude / --include', 'Glob filters applied in order.']
      ],
      output: { format: 'plain', body: `(dryrun) delete: s3://example-bucket/tmp/build-1.tmp
(dryrun) delete: s3://example-bucket/tmp/build-2.tmp
delete: s3://example-bucket/tmp/build-1.tmp
delete: s3://example-bucket/tmp/build-2.tmp` },
      note: { type: 'danger', text: 'There is no recycle bin. `aws s3 rb s3://<bucket> --force` deletes every object and then the bucket. On versioned buckets, removing all versions requires listing `list-object-versions` and deleting each `VersionId`.' },
      iam: ['s3:DeleteObject', 's3:ListBucket'],
      related: ['s3-sync', 's3-lifecycle', 's3-versioning'],
      tags: ['destructive']
    },
    {
      id: 'sync',
      subtopic: 'sync-filters',
      title: 'Sync a directory to S3 (and mirror deletions)',
      command: `aws s3 sync ./site/ s3://<bucket>/ \\
  --delete \\
  --exclude ".git/*" --exclude "*.map" \\
  --cache-control "max-age=300" \\
  --dryrun`,
      description: 'Copies only files whose size or modification time differ from the destination, so repeated runs are cheap. `--delete` removes destination objects that no longer exist locally, which makes it a true mirror.',
      flags: [
        ['--delete', 'Remove extra objects at the destination. Review the dry run before using it.'],
        ['--exclude / --include', 'Glob patterns relative to the source root; later filters override earlier ones.'],
        ['--exact-timestamps', 'Download only when timestamps match exactly (S3 → local); default treats same-size as identical.'],
        ['--size-only', 'Ignore timestamps entirely; useful when files are regenerated with new mtimes but identical content.'],
        ['--cache-control / --content-type', 'Metadata applied to uploaded objects.']
      ],
      output: { format: 'plain', body: `(dryrun) upload: site/index.html to s3://example-bucket/index.html
(dryrun) upload: site/css/site.css to s3://example-bucket/css/site.css
(dryrun) delete: s3://example-bucket/old-page.html` },
      note: { type: 'gotcha', text: 'sync compares size and mtime, not content hashes. A file touched without changes re-uploads; a file changed in place with the same size and older mtime does not. Use `--size-only` or `--exact-timestamps` deliberately.' },
      iam: ['s3:ListBucket', 's3:PutObject', 's3:DeleteObject'],
      related: ['s3-cp', 's3-rm', 's3-sync-download'],
      tags: ['mutating']
    },
    {
      id: 'sync-download',
      subtopic: 'sync-filters',
      title: 'Pull only a subset of a bucket locally',
      command: `aws s3 sync s3://<bucket>/logs/2026/09/ ./logs/ \\
  --exclude "*" --include "*app-1*.log.gz" \\
  --exact-timestamps`,
      description: 'Filters make sync a selective downloader. Because `--exclude "*"` comes first, only keys matching the later `--include` are considered.',
      flags: [
        ['--exclude "*" --include "pattern"', 'The idiom for "only these". Patterns support `*`, `?` and `[seq]`.'],
        ['--exact-timestamps', 'Re-download when the S3 timestamp differs, even if sizes match.'],
        ['--request-payer requester', '(optional) For requester-pays buckets.']
      ],
      output: { format: 'plain', body: `download: s3://example-bucket/logs/2026/09/18/app-10.log.gz to logs/18/app-10.log.gz
download: s3://example-bucket/logs/2026/09/18/app-11.log.gz to logs/18/app-11.log.gz
download: s3://example-bucket/logs/2026/09/18/app-12.log.gz to logs/18/app-12.log.gz` },
      iam: ['s3:ListBucket', 's3:GetObject'],
      related: ['s3-sync', 's3-ls'],
      tags: ['mutating']
    },
    {
      id: 'presign',
      subtopic: 'urls-metadata',
      title: 'Generate a presigned download URL',
      command: `aws s3 presign s3://<bucket>/<key> --expires-in 3600`,
      description: 'Creates a URL that grants GET access to one object for a limited time using your credentials\' signature. Anyone with the URL can download until it expires or your credentials are revoked.',
      flags: [
        ['--expires-in', 'Seconds, default 3600, maximum 604800 (7 days). URLs signed with temporary credentials die when the session does, whatever you set here.']
      ],
      output: { format: 'plain', body: `https://example-bucket.s3.us-east-1.amazonaws.com/reports/q3.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAIOSFODNN7EXAMPLE%2F20260918%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260918T145512Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Security-Token=IQoJb3JpZ2luX2VjExampleTruncated&X-Amz-Signature=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` },
      note: { type: 'gotcha', text: 'The CLI only presigns GET. For uploads (PUT) use an SDK. If the bucket is KMS-encrypted the downloader\'s request still needs `kms:Decrypt` via your signature, which works as long as your identity has it.' },
      iam: ['s3:GetObject'],
      related: ['s3-head-object', 's3-bucket-policy'],
      tags: ['read-only', 'security']
    },
    {
      id: 'head-object',
      subtopic: 'urls-metadata',
      title: 'Inspect an object\'s metadata without downloading it',
      command: `aws s3api head-object --bucket <bucket> --key <key>`,
      description: 'Returns size, ETag, storage class, encryption, version ID and user metadata. Exits 254 with `Not Found` if the key does not exist, which makes it a handy existence check in scripts.',
      flags: [
        ['--version-id', '(optional) Inspect a specific version on a versioned bucket.'],
        ['--query ContentLength --output text', '(optional) Just the size in bytes.']
      ],
      output: { format: 'json', body: `{
    "AcceptRanges": "bytes",
    "LastModified": "2026-09-18T14:05:12+00:00",
    "ContentLength": 184320,
    "ETag": "\\"9b2cf535f27731c974343645a3985328\\"",
    "VersionId": "3sL4kqtJlcpXroDTDmJ+rmSpXd3dIbrHY+MTRCxf3vjVBH40Nr8X8gdRQBpUMLUo",
    "ContentType": "application/gzip",
    "ServerSideEncryption": "aws:kms",
    "Metadata": {
        "source-host": "web-1"
    },
    "SSEKMSKeyId": "arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab",
    "StorageClass": "STANDARD_IA"
}` },
      iam: ['s3:GetObject'],
      related: ['s3-presign', 's3-largest-objects'],
      tags: ['read-only']
    },
    {
      id: 'largest-objects',
      subtopic: 'urls-metadata',
      title: 'Find the largest objects under a prefix',
      command: `aws s3api list-objects-v2 \\
  --bucket <bucket> --prefix <prefix>/ \\
  --query 'sort_by(Contents,&Size)[-5:].[Size,Key,StorageClass]' \\
  --output table`,
      description: 'The API returns up to 1000 keys per page and the CLI pages through all of them, so on a large prefix this takes a while but needs no S3 Inventory setup.',
      flags: [
        ['sort_by(Contents,&Size)[-5:]', 'Ascending sort, last five = largest.'],
        ['--prefix', 'Narrow the listing to a key prefix.']
      ],
      output: { format: 'table', body: `-----------------------------------------------------------
|                      ListObjectsV2                      |
+-------------+------------------------------+------------+
|  524288000  |  backups/db-2026-09-14.dump  |  STANDARD  |
|  536870912  |  backups/db-2026-09-15.dump  |  STANDARD  |
|  541065216  |  backups/db-2026-09-16.dump  |  STANDARD  |
|  545259520  |  backups/db-2026-09-17.dump  |  STANDARD  |
|  549453824  |  backups/db-2026-09-18.dump  |  STANDARD  |
+-------------+------------------------------+------------+` },
      iam: ['s3:ListBucket'],
      related: ['output-query-sort', 's3-ls'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'bucket-policy',
      subtopic: 'bucket-config',
      title: 'Get and set the bucket policy',
      command: `aws s3api get-bucket-policy --bucket <bucket> --query Policy --output text | jq .
aws s3api put-bucket-policy --bucket <bucket> --policy file://bucket-policy.json`,
      description: 'The policy is returned as a JSON string inside JSON; the `--query Policy --output text | jq .` idiom prints it readably. `put` replaces the whole policy, so always start from the current one.',
      flags: [
        ['get-bucket-policy', 'Fails with `NoSuchBucketPolicy` if there is none.'],
        ['put-bucket-policy --policy file://', 'Full replacement. Validate with `aws accessanalyzer validate-policy --policy-type RESOURCE_POLICY` first if you have Access Analyzer.'],
        ['delete-bucket-policy', 'Remove it entirely.']
      ],
      output: { format: 'json', body: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSSLRequestsOnly",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::example-bucket",
        "arn:aws:s3:::example-bucket/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}` },
      note: { type: 'danger', text: 'A policy that denies too broadly can lock out the account, including you. Keep a root or break-glass path, and never put a `Deny` with `Principal: *` on `s3:PutBucketPolicy` without an exception for your admin role.' },
      iam: ['s3:GetBucketPolicy', 's3:PutBucketPolicy'],
      related: ['s3-public-access-block', 's3-presign'],
      tags: ['mutating', 'security']
    },
    {
      id: 'versioning',
      subtopic: 'bucket-config',
      title: 'Enable versioning and check its status',
      command: `aws s3api put-bucket-versioning --bucket <bucket> --versioning-configuration Status=Enabled
aws s3api get-bucket-versioning --bucket <bucket>`,
      description: 'Versioning keeps every overwrite and delete recoverable. Once enabled it can only be suspended, never disabled; existing versions stay. Pair it with a lifecycle rule to expire old versions or costs grow silently.',
      flags: [
        ['Status=Enabled|Suspended', 'The only two values after the first enable.'],
        ['MFADelete=Enabled', '(optional, root + MFA only) Require MFA to delete versions.']
      ],
      output: { format: 'json', body: `{
    "Status": "Enabled"
}` },
      note: { type: 'info', text: '`get-bucket-versioning` returns `{}` (empty) for a bucket that has never had versioning, not `Status: Disabled`.' },
      iam: ['s3:PutBucketVersioning', 's3:GetBucketVersioning'],
      related: ['s3-lifecycle', 's3-rm'],
      tags: ['mutating']
    },
    {
      id: 'bucket-encryption',
      subtopic: 'bucket-config',
      title: 'Set default encryption to SSE-KMS with a bucket key',
      command: `aws s3api put-bucket-encryption --bucket <bucket> --server-side-encryption-configuration '{
  "Rules": [{
    "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms", "KMSMasterKeyID": "alias/<key-alias>"},
    "BucketKeyEnabled": true
  }]
}'
aws s3api get-bucket-encryption --bucket <bucket>`,
      description: 'Every new object without an explicit encryption header gets this. `BucketKeyEnabled` cuts KMS request costs by up to 99% on busy buckets. Existing objects are not re-encrypted; copy them onto themselves to apply it.',
      flags: [
        ['SSEAlgorithm', '`AES256` (SSE-S3, the default since 2023) or `aws:kms`. `aws:kms:dsse` is dual-layer.'],
        ['KMSMasterKeyID', 'Key ID, ARN or alias. Cross-account readers need access to this key too.'],
        ['BucketKeyEnabled', 'Use an S3 bucket-level data key to reduce KMS calls.']
      ],
      output: { format: 'json', body: `{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "aws:kms",
                    "KMSMasterKeyID": "alias/s3-prod"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}` },
      iam: ['s3:PutEncryptionConfiguration', 's3:GetEncryptionConfiguration'],
      related: ['secrets-kms-describe-key', 's3-cp'],
      tags: ['mutating', 'security']
    },
    {
      id: 'public-access-block',
      subtopic: 'bucket-config',
      title: 'Block all public access (bucket or whole account)',
      command: `aws s3api put-public-access-block --bucket <bucket> \\
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
# account-wide:
aws s3control put-public-access-block --account-id 123456789012 \\
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api get-public-access-block --bucket <bucket>`,
      description: 'Four switches that override any ACL or policy attempting to grant public access. New buckets get all four on by default; the account-level setting is the guard rail that catches everything else.',
      flags: [
        ['BlockPublicPolicy', 'Reject `put-bucket-policy` calls that would grant public access.'],
        ['RestrictPublicBuckets', 'Ignore existing public policies for anyone outside the account.'],
        ['s3control … --account-id', 'The account-wide version; note the different service name.']
      ],
      output: { format: 'json', body: `{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}` },
      iam: ['s3:PutBucketPublicAccessBlock', 's3:GetBucketPublicAccessBlock', 's3:PutAccountPublicAccessBlock'],
      related: ['s3-bucket-policy', 'security-securityhub-findings'],
      tags: ['mutating', 'security']
    },
    {
      id: 'lifecycle',
      subtopic: 'bucket-config',
      title: 'Add a lifecycle rule: tier, expire, and abort stale multipart uploads',
      command: `aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration '{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Filter": {"Prefix": "logs/"},
      "Status": "Enabled",
      "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}, {"Days": 90, "StorageClass": "GLACIER_IR"}],
      "Expiration": {"Days": 365},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }
  ]
}'
aws s3api get-bucket-lifecycle-configuration --bucket <bucket>`,
      description: 'One rule can move objects down storage classes, expire them, purge old versions and clean up abandoned multipart uploads. `put` replaces the entire configuration, so include every rule you want to keep.',
      flags: [
        ['Filter.Prefix', 'Scope of the rule. `"Filter": {}` applies to the whole bucket.'],
        ['Transitions', 'Minimum 30 days before IA classes; Glacier classes need no minimum but have retrieval fees.'],
        ['NoncurrentVersionExpiration', 'Essential on versioned buckets or old versions accumulate forever.'],
        ['AbortIncompleteMultipartUpload', 'Frees storage from uploads that never completed.']
      ],
      output: { format: 'json', body: `{
    "Rules": [
        {
            "Expiration": {
                "Days": 365
            },
            "ID": "logs-tiering",
            "Filter": {
                "Prefix": "logs/"
            },
            "Status": "Enabled",
            "Transitions": [
                {
                    "Days": 30,
                    "StorageClass": "STANDARD_IA"
                },
                {
                    "Days": 90,
                    "StorageClass": "GLACIER_IR"
                }
            ],
            "NoncurrentVersionExpiration": {
                "NoncurrentDays": 30
            },
            "AbortIncompleteMultipartUpload": {
                "DaysAfterInitiation": 7
            }
        }
    ]
}` },
      iam: ['s3:PutLifecycleConfiguration', 's3:GetLifecycleConfiguration'],
      related: ['s3-versioning', 's3-abort-multipart'],
      tags: ['mutating', 'cost']
    },
    {
      id: 'list-multipart',
      subtopic: 'multipart',
      title: 'List incomplete multipart uploads',
      command: `aws s3api list-multipart-uploads --bucket <bucket> \\
  --query 'Uploads[].[Key,UploadId,Initiated]' --output text`,
      description: 'Interrupted `cp`/`sync` runs leave parts behind that are invisible to `s3 ls` but fully billed. On busy upload buckets this can be a surprising fraction of the bill.',
      flags: [
        ['--prefix', '(optional) Limit to a key prefix.']
      ],
      output: { format: 'text', body: `backups/db-2026-09-12.dump	Xg5F1kExampleUploadIdB2hZ3p7a9Q1c4E6g8I0k2M4o6Q8s0U2w4Y6a8C0e2G4i	2026-09-12T02:14:09+00:00
backups/db-2026-08-30.dump	R4tExampleUploadIdL8nP0rT2vX4zB6dF8hJ0lN2pR4tV6xZ8bD0fH2jL4nP6r	2026-08-30T02:13:51+00:00` },
      iam: ['s3:ListBucketMultipartUploads'],
      related: ['s3-abort-multipart', 's3-lifecycle'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'abort-multipart',
      subtopic: 'multipart',
      title: 'Abort every incomplete multipart upload in a bucket',
      command: `aws s3api list-multipart-uploads --bucket <bucket> \\
  --query 'Uploads[].[Key,UploadId]' --output text |
while IFS=$'\\t' read -r key id; do
  aws s3api abort-multipart-upload --bucket <bucket> --key "$key" --upload-id "$id"
done`,
      description: 'Reads key and upload ID pairs from text output and aborts each one. For ongoing hygiene, prefer the lifecycle rule `AbortIncompleteMultipartUpload` so this never needs running again.',
      flags: [
        ['IFS=$\'\\t\' read -r key id', 'Split on tabs so keys containing spaces survive.'],
        ['abort-multipart-upload', 'Deletes all uploaded parts for that upload ID.']
      ],
      output: { format: 'none', body: '' },
      iam: ['s3:ListBucketMultipartUploads', 's3:AbortMultipartUpload'],
      related: ['s3-list-multipart', 's3-lifecycle'],
      tags: ['destructive', 'scripting', 'cost']
    }
  ]
});
