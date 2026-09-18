/* Topic: VPC & Networking */
AWSCHEAT.register({
  id: 'vpc',
  title: 'VPC & Networking',
  order: 6,
  intro: 'Answering "why can\'t A reach B" from the CLI: find the VPC and subnet, read the route table and NACL, locate the ENI that owns an IP, check endpoints, and let Reachability Analyzer do the path math.',
  subtopics: [
    { id: 'vpcs-subnets', title: 'VPCs & subnets' },
    { id: 'routing', title: 'Route tables & gateways' },
    { id: 'nacls', title: 'Network ACLs' },
    { id: 'enis', title: 'Network interfaces' },
    { id: 'endpoints', title: 'VPC endpoints' },
    { id: 'flow-logs', title: 'Flow logs' },
    { id: 'analyzer', title: 'Reachability Analyzer' }
  ],
  cards: [
    {
      id: 'describe-vpcs',
      subtopic: 'vpcs-subnets',
      title: 'List VPCs with CIDR, name and default flag',
      command: `aws ec2 describe-vpcs \\
  --query 'Vpcs[].{ID:VpcId,CIDR:CidrBlock,Name:Tags[?Key==\`Name\`]|[0].Value,Default:IsDefault,State:State}' \\
  --output table`,
      description: 'The starting point for any network investigation. Secondary CIDRs are not shown here; add `CidrBlockAssociationSet[].CidrBlock` to see them.',
      flags: [
        ['--filters Name=is-default,Values=true', '(optional) Just the default VPC.'],
        ['--vpc-ids <vpc-id>', '(optional) One VPC.']
      ],
      output: { format: 'table', body: `-----------------------------------------------------------------------
|                             DescribeVpcs                            |
+-----------------+-----------+----------------+--------+-------------+
|       CIDR      |  Default  |       ID       |  Name  |    State    |
+-----------------+-----------+----------------+--------+-------------+
|  10.0.0.0/16    |  False    |  vpc-0a1b2c3d  |  main  |  available  |
|  172.31.0.0/16  |  True     |  vpc-0f9e8d7c  |  None  |  available  |
+-----------------+-----------+----------------+--------+-------------+` },
      iam: ['ec2:DescribeVpcs'],
      related: ['vpc-describe-subnets', 'output-query-text-shapes'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-subnets',
      subtopic: 'vpcs-subnets',
      title: 'List subnets in a VPC with free IP counts',
      command: `aws ec2 describe-subnets \\
  --filters Name=vpc-id,Values=<vpc-id> \\
  --query 'sort_by(Subnets,&AvailabilityZone)[].{ID:SubnetId,AZ:AvailabilityZone,CIDR:CidrBlock,Free:AvailableIpAddressCount,Public:MapPublicIpOnLaunch,Name:Tags[?Key==\`Name\`]|[0].Value}' \\
  --output table`,
      description: '`AvailableIpAddressCount` is the number that explains `InsufficientFreeAddressesInSubnet` launch failures, and `MapPublicIpOnLaunch` is the usual definition of a "public" subnet.',
      flags: [
        ['--filters Name=vpc-id,Values=…', 'Scope to one VPC. `Name=availability-zone,Values=us-east-1a` narrows further.'],
        ['sort_by(Subnets,&AvailabilityZone)', 'Group rows by AZ.']
      ],
      output: { format: 'table', body: `-------------------------------------------------------------------------------------------------
|                                        DescribeSubnets                                        |
+--------------+----------------+--------+----------------------------+--------------+----------+
|      AZ      |      CIDR      |  Free  |             ID             |     Name     |  Public  |
+--------------+----------------+--------+----------------------------+--------------+----------+
|  us-east-1a  |  10.0.1.0/24   |  241   |  subnet-0a1b2c3d4e5f67890  |  public-1a   |  True    |
|  us-east-1a  |  10.0.11.0/24  |  198   |  subnet-0123456789abcdef0  |  private-1a  |  False   |
|  us-east-1b  |  10.0.2.0/24   |  247   |  subnet-0fedcba9876543210  |  public-1b   |  True    |
|  us-east-1b  |  10.0.12.0/24  |  203   |  subnet-0abcdef1234567890  |  private-1b  |  False   |
+--------------+----------------+--------+----------------------------+--------------+----------+` },
      iam: ['ec2:DescribeSubnets'],
      related: ['vpc-describe-vpcs', 'vpc-route-table-for-subnet'],
      tags: ['read-only', 'query']
    },
    {
      id: 'route-table-for-subnet',
      subtopic: 'routing',
      title: 'Show the route table (and routes) that applies to a subnet',
      command: `aws ec2 describe-route-tables \\
  --filters Name=association.subnet-id,Values=<subnet-id> \\
  --query 'RouteTables[].{ID:RouteTableId,Routes:Routes[].{Dest:DestinationCidrBlock,Target:join(\`\`,[GatewayId,NatGatewayId,TransitGatewayId,VpcPeeringConnectionId,NetworkInterfaceId][?@]|[0]),State:State}}'`,
      description: 'A subnet uses its explicitly associated route table, or the VPC main table if none. This filter finds explicit associations; if it returns nothing, query with `Name=association.main,Values=true` instead.',
      flags: [
        ['Name=association.subnet-id', 'Route tables explicitly associated with the subnet.'],
        ['Target:…[?@]|[0]', 'Routes put the target in different fields depending on type; this picks whichever is non-null.'],
        ['State', '`blackhole` means the target (NAT, peering, ENI) no longer exists.']
      ],
      output: { format: 'json', body: `[
    {
        "ID": "rtb-0a1b2c3d4e5f67890",
        "Routes": [
            {
                "Dest": "10.0.0.0/16",
                "Target": "local",
                "State": "active"
            },
            {
                "Dest": "0.0.0.0/0",
                "Target": "nat-0abc123def4567890",
                "State": "active"
            },
            {
                "Dest": "10.1.0.0/16",
                "Target": "pcx-0123456789abcdef0",
                "State": "blackhole"
            }
        ]
    }
]` },
      iam: ['ec2:DescribeRouteTables'],
      related: ['vpc-describe-subnets', 'vpc-nat-gateways'],
      tags: ['read-only', 'query']
    },
    {
      id: 'nat-gateways',
      subtopic: 'routing',
      title: 'List NAT gateways with state and public IP',
      command: `aws ec2 describe-nat-gateways \\
  --filter Name=vpc-id,Values=<vpc-id> \\
  --query 'NatGateways[].[NatGatewayId,State,SubnetId,NatGatewayAddresses[0].PublicIp,ConnectivityType]' \\
  --output text`,
      description: 'The public IP here is what the internet sees for egress from private subnets, which is what you need for allow-lists on the other side. Note the singular `--filter` on this command.',
      flags: [
        ['--filter', 'Yes, singular. One of the few EC2 commands with that spelling.'],
        ['ConnectivityType', '`public` (internet egress) or `private` (to other VPCs/on-prem via TGW).']
      ],
      output: { format: 'text', body: `nat-0abc123def4567890	available	subnet-0a1b2c3d4e5f67890	203.0.113.10	public
nat-0123456789abcdef0	available	subnet-0fedcba9876543210	203.0.113.11	public` },
      iam: ['ec2:DescribeNatGateways'],
      related: ['vpc-route-table-for-subnet', 'vpc-internet-gateway'],
      tags: ['read-only', 'query']
    },
    {
      id: 'internet-gateway',
      subtopic: 'routing',
      title: 'Find the internet gateway attached to a VPC',
      command: `aws ec2 describe-internet-gateways \\
  --filters Name=attachment.vpc-id,Values=<vpc-id> \\
  --query 'InternetGateways[].[InternetGatewayId,Attachments[0].State]' \\
  --output text`,
      description: 'A VPC has at most one IGW. No result here plus a `0.0.0.0/0` route pointing at `igw-…` in a route table means the gateway was detached and the route is a blackhole.',
      flags: [
        ['Name=attachment.vpc-id', 'Filter by the VPC the IGW is attached to.']
      ],
      output: { format: 'text', body: `igw-0a1b2c3d4e5f67890	available` },
      iam: ['ec2:DescribeInternetGateways'],
      related: ['vpc-nat-gateways', 'vpc-route-table-for-subnet'],
      tags: ['read-only', 'query']
    },
    {
      id: 'describe-nacls',
      subtopic: 'nacls',
      title: 'Show NACL rules for a subnet in evaluation order',
      command: `aws ec2 describe-network-acls \\
  --filters Name=association.subnet-id,Values=<subnet-id> \\
  --query 'NetworkAcls[0].Entries[?Egress==\`false\`] | sort_by(@,&RuleNumber)[].{Rule:RuleNumber,Action:RuleAction,Proto:Protocol,From:PortRange.From,To:PortRange.To,CIDR:CidrBlock}' \\
  --output table`,
      description: 'NACLs are stateless and evaluated lowest rule number first, so order matters and you need both directions. This shows inbound; change to `Egress==\\`true\\`` for outbound. Protocol `-1` is all, `6` TCP, `17` UDP.',
      flags: [
        ['Entries[?Egress==`false`]', 'Inbound rules only.'],
        ['sort_by(@,&RuleNumber)', 'Evaluation order. Rule `32767` is the implicit deny-all.'],
        ['Ephemeral ports', 'Return traffic needs 1024–65535 allowed in the opposite direction; the classic NACL mistake.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------
|                      DescribeNetworkAcls                       |
+----------+--------------+--------+---------+---------+---------+
|  Action  |     CIDR     |  From  |  Proto  |   Rule  |    To   |
+----------+--------------+--------+---------+---------+---------+
|  allow   |  10.0.0.0/8  |  443   |  6      |  100    |  443    |
|  allow   |  0.0.0.0/0   |  1024  |  6      |  110    |  65535  |
|  deny    |  0.0.0.0/0   |  None  |  -1     |  32767  |  None   |
+----------+--------------+--------+---------+---------+---------+` },
      iam: ['ec2:DescribeNetworkAcls'],
      related: ['ec2-describe-sg-rules', 'vpc-reachability'],
      tags: ['read-only', 'query', 'security']
    },
    {
      id: 'eni-by-ip',
      subtopic: 'enis',
      title: 'Find what owns a private IP address',
      command: `aws ec2 describe-network-interfaces \\
  --filters Name=addresses.private-ip-address,Values=10.0.1.23 \\
  --query 'NetworkInterfaces[].{ENI:NetworkInterfaceId,Type:InterfaceType,Desc:Description,Instance:Attachment.InstanceId,Owner:Attachment.InstanceOwnerId,SG:Groups[].GroupId,Subnet:SubnetId}'`,
      description: 'Every IP in a VPC belongs to an ENI, and the ENI description says whether it is an instance, a Lambda, an RDS node, a load balancer or an endpoint. This resolves the mystery IP in a flow log or a security alert.',
      flags: [
        ['Name=addresses.private-ip-address', 'Matches primary and secondary IPs.'],
        ['Description', 'Free text set by the service: `ELB app/…`, `AWS Lambda VPC ENI…`, `RDSNetworkInterface`, `Interface for NAT Gateway …`.'],
        ['Attachment.InstanceOwnerId', '`amazon-elb`, `amazon-rds` etc. for service-owned ENIs, your account ID for instances.']
      ],
      output: { format: 'json', body: `[
    {
        "ENI": "eni-0abc123def4567890",
        "Type": "interface",
        "Desc": "Primary network interface",
        "Instance": "i-0abc123def4567890",
        "Owner": "123456789012",
        "SG": [
            "sg-0a1b2c3d4e5f6a7b8"
        ],
        "Subnet": "subnet-0a1b2c3d4e5f67890"
    }
]` },
      iam: ['ec2:DescribeNetworkInterfaces'],
      related: ['vpc-eni-unattached', 'vpc-flow-logs-create'],
      tags: ['read-only', 'query']
    },
    {
      id: 'eni-unattached',
      subtopic: 'enis',
      title: 'List unattached ENIs (leftovers that block subnet or SG deletion)',
      command: `aws ec2 describe-network-interfaces \\
  --filters Name=status,Values=available \\
  --query 'NetworkInterfaces[].[NetworkInterfaceId,SubnetId,Description]' \\
  --output text`,
      description: 'Available ENIs are usually orphans from Lambda, ECS tasks or deleted instances. They are what makes `DependencyViolation` appear when you try to delete a security group or subnet.',
      flags: [
        ['Name=status,Values=available', 'Not attached to anything.'],
        ['delete-network-interface --network-interface-id', 'Clean-up command; service-managed ENIs (`requester-managed`) cannot be deleted by you.']
      ],
      output: { format: 'text', body: `eni-0123456789abcdef0	subnet-0123456789abcdef0	AWS Lambda VPC ENI-report-fn-0a1b2c3d-4e5f-6789-abcd-ef0123456789
eni-0fedcba9876543210	subnet-0abcdef1234567890	old bastion` },
      iam: ['ec2:DescribeNetworkInterfaces'],
      related: ['vpc-eni-by-ip', 'ec2-revoke-ingress'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'describe-endpoints',
      subtopic: 'endpoints',
      title: 'List VPC endpoints and their type',
      command: `aws ec2 describe-vpc-endpoints \\
  --filters Name=vpc-id,Values=<vpc-id> \\
  --query 'VpcEndpoints[].{ID:VpcEndpointId,Service:ServiceName,Type:VpcEndpointType,State:State,PrivateDNS:PrivateDnsEnabled}' \\
  --output table`,
      description: 'Gateway endpoints (S3, DynamoDB) work through route table entries; interface endpoints are ENIs with private DNS. A private subnet with no NAT and no endpoint for a service simply cannot reach it.',
      flags: [
        ['PrivateDnsEnabled', 'For interface endpoints: if false, the public service hostname still resolves to public IPs and traffic will not use the endpoint.']
      ],
      output: { format: 'table', body: `---------------------------------------------------------------------------------------------------------------
|                                             DescribeVpcEndpoints                                            |
+--------------------------+--------------+---------------------------------------+-------------+-------------+
|            ID            |  PrivateDNS  |                Service                |    State    |     Type    |
+--------------------------+--------------+---------------------------------------+-------------+-------------+
|  vpce-0a1b2c3d4e5f67890  |  None        |  com.amazonaws.us-east-1.s3           |  available  |  Gateway    |
|  vpce-0123456789abcdef0  |  True        |  com.amazonaws.us-east-1.ssm          |  available  |  Interface  |
|  vpce-0fedcba9876543210  |  True        |  com.amazonaws.us-east-1.ssmmessages  |  available  |  Interface  |
+--------------------------+--------------+---------------------------------------+-------------+-------------+` },
      iam: ['ec2:DescribeVpcEndpoints'],
      related: ['vpc-create-endpoint', 'ssm-start-session'],
      tags: ['read-only', 'query']
    },
    {
      id: 'create-endpoint',
      subtopic: 'endpoints',
      title: 'Create an S3 gateway endpoint (free, no NAT needed)',
      command: `aws ec2 create-vpc-endpoint \\
  --vpc-id <vpc-id> \\
  --vpc-endpoint-type Gateway \\
  --service-name com.amazonaws.us-east-1.s3 \\
  --route-table-ids <route-table-id> \\
  --tag-specifications 'ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=s3-gateway}]'`,
      description: 'Adds a prefix-list route for S3 to the given route tables so private subnets reach S3 without NAT charges. For interface endpoints (SSM, ECR, Secrets Manager) use `--vpc-endpoint-type Interface --subnet-ids … --security-group-ids … --private-dns-enabled`.',
      flags: [
        ['--service-name', 'Region-specific. `aws ec2 describe-vpc-endpoint-services --query \'ServiceNames\'` lists them. In GovCloud: `com.amazonaws.us-gov-west-1.s3`.'],
        ['--route-table-ids', 'Gateway endpoints only; the route is managed for you.'],
        ['--policy-document file://…', '(optional) Restrict which buckets/actions are reachable through the endpoint.']
      ],
      output: { format: 'json', body: `{
    "VpcEndpoint": {
        "VpcEndpointId": "vpce-0a1b2c3d4e5f67890",
        "VpcEndpointType": "Gateway",
        "VpcId": "vpc-0a1b2c3d",
        "ServiceName": "com.amazonaws.us-east-1.s3",
        "State": "available",
        "PolicyDocument": "{\\"Version\\":\\"2008-10-17\\",\\"Statement\\":[{\\"Effect\\":\\"Allow\\",\\"Principal\\":\\"*\\",\\"Action\\":\\"*\\",\\"Resource\\":\\"*\\"}]}",
        "RouteTableIds": [
            "rtb-0a1b2c3d4e5f67890"
        ],
        "SubnetIds": [],
        "Groups": [],
        "PrivateDnsEnabled": false,
        "RequesterManaged": false,
        "NetworkInterfaceIds": [],
        "DnsEntries": [],
        "CreationTimestamp": "2026-09-18T14:50:31+00:00",
        "Tags": [
            {
                "Key": "Name",
                "Value": "s3-gateway"
            }
        ],
        "OwnerId": "123456789012"
    }
}` },
      iam: ['ec2:CreateVpcEndpoint', 'ec2:CreateTags'],
      related: ['vpc-describe-endpoints', 'govcloud-fips-endpoints'],
      tags: ['mutating']
    },
    {
      id: 'flow-logs-create',
      subtopic: 'flow-logs',
      title: 'Enable VPC flow logs to CloudWatch Logs',
      command: `aws ec2 create-flow-logs \\
  --resource-type VPC \\
  --resource-ids <vpc-id> \\
  --traffic-type ALL \\
  --log-destination-type cloud-watch-logs \\
  --log-group-name /vpc/flow-logs/<vpc-id> \\
  --deliver-logs-permission-arn arn:aws:iam::123456789012:role/<flow-logs-role> \\
  --max-aggregation-interval 60`,
      description: 'Captures accepted and rejected connections per ENI. The role must trust `vpc-flow-logs.amazonaws.com` and be allowed to write to the log group. For long-term or cheap storage use `--log-destination-type s3 --log-destination arn:aws:s3:::example-bucket/flow/`.',
      flags: [
        ['--resource-type', '`VPC`, `Subnet`, `NetworkInterface` or `TransitGateway`.'],
        ['--traffic-type', '`ACCEPT`, `REJECT` or `ALL`. REJECT-only is a cheap way to catch security group and NACL blocks.'],
        ['--max-aggregation-interval', '60 or 600 seconds. Shorter means faster visibility and more records.'],
        ['--log-format', '(optional) Custom fields, e.g. add `${pkt-srcaddr} ${flow-direction} ${tcp-flags}`.']
      ],
      output: { format: 'json', body: `{
    "ClientToken": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
    "FlowLogIds": [
        "fl-0abc123def4567890"
    ],
    "Unsuccessful": []
}` },
      iam: ['ec2:CreateFlowLogs', 'iam:PassRole', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      related: ['vpc-flow-logs-query', 'cloudwatch-insights-start-query'],
      tags: ['mutating', 'security']
    },
    {
      id: 'flow-logs-query',
      subtopic: 'flow-logs',
      title: 'Find rejected connections to a host in flow logs',
      command: `aws logs filter-log-events \\
  --log-group-name /vpc/flow-logs/<vpc-id> \\
  --start-time $(($(date +%s) - 900))000 \\
  --filter-pattern '[version, account, eni, src, dst="10.0.1.23", srcport, dstport="443", proto, packets, bytes, start, end, action="REJECT", status]' \\
  --query 'events[].message' \\
  --output text`,
      description: 'The default flow-log format is space-separated, so a positional filter pattern with field names picks records where the destination and port match and the action is REJECT. Rejects with `status=OK` mean a security group or NACL dropped the packet.',
      flags: [
        ['--filter-pattern \'[…]\'', 'Space-delimited pattern; each name is a positional field, `=` adds a condition.'],
        ['--start-time', 'Epoch milliseconds; the shell arithmetic gives "15 minutes ago" (on macOS use `date -v-15M +%s`).']
      ],
      output: { format: 'text', body: `2 123456789012 eni-0abc123def4567890 198.51.100.7 10.0.1.23 51234 443 6 3 180 1758205020 1758205079 REJECT OK
2 123456789012 eni-0abc123def4567890 198.51.100.7 10.0.1.23 51235 443 6 1 60 1758205081 1758205140 REJECT OK` },
      iam: ['logs:FilterLogEvents'],
      related: ['vpc-flow-logs-create', 'cloudwatch-filter-log-events', 'vpc-eni-by-ip'],
      tags: ['read-only', 'security', 'query']
    },
    {
      id: 'reachability',
      subtopic: 'analyzer',
      title: 'Ask Reachability Analyzer whether A can reach B on a port',
      command: `PATH_ID=$(aws ec2 create-network-insights-path \\
  --source <instance-id> --destination <instance-id-2> \\
  --protocol tcp --destination-port 443 \\
  --query NetworkInsightsPath.NetworkInsightsPathId --output text)
ANALYSIS_ID=$(aws ec2 start-network-insights-analysis \\
  --network-insights-path-id "$PATH_ID" \\
  --query NetworkInsightsAnalysis.NetworkInsightsAnalysisId --output text)
sleep 20
aws ec2 describe-network-insights-analyses \\
  --network-insights-analysis-ids "$ANALYSIS_ID" \\
  --query 'NetworkInsightsAnalyses[0].{Status:Status,Reachable:NetworkPathFound,Why:Explanations[].{Code:ExplanationCode,Component:Component.Id}}'`,
      description: 'Reachability Analyzer evaluates route tables, security groups, NACLs, peering and gateways for a hypothetical packet and tells you exactly which component blocks it. Source and destination can be instances, ENIs, IGWs, VPN and TGW attachments, or endpoints.',
      flags: [
        ['create-network-insights-path', 'Defines the question. Reusable: run new analyses against the same path after changes.'],
        ['start-network-insights-analysis', 'Runs the evaluation; typically finishes in 10–30 s.'],
        ['ExplanationCode', 'Values like `SECURITY_GROUP_NO_INBOUND_RULE`, `NO_ROUTE_TO_DESTINATION`, `NETWORK_ACL_DENY_INBOUND` pinpoint the block.']
      ],
      output: { format: 'json', body: `{
    "Status": "succeeded",
    "Reachable": false,
    "Why": [
        {
            "Code": "ENI_SG_RULES_MISMATCH",
            "Component": "sg-0f9e8d7c6b5a43210"
        }
    ]
}` },
      note: { type: 'info', text: 'Each analysis is billed (about $0.10). Clean up with `delete-network-insights-analysis` and `delete-network-insights-path` when done, or keep the path for regression checks.' },
      iam: ['ec2:CreateNetworkInsightsPath', 'ec2:StartNetworkInsightsAnalysis', 'ec2:DescribeNetworkInsightsAnalyses', 'tiros:CreateQuery', 'tiros:GetQueryAnswer'],
      related: ['vpc-describe-nacls', 'ec2-describe-sg-rules'],
      tags: ['mutating', 'scripting', 'cost']
    }
  ]
});
