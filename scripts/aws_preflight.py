"""Read-only AWS discovery. Does not provision resources or claim remaining credits."""
import json
import os
import boto3

def main():
    session=boto3.Session(region_name=os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION'))
    identity=session.client('sts').get_caller_identity()
    bedrock=session.client('bedrock')
    profiles=[]
    for page in bedrock.get_paginator('list_inference_profiles').paginate():
        profiles.extend({'id':p['inferenceProfileId'],'status':p['status']} for p in page['inferenceProfileSummaries'] if 'nova-lite' in p['inferenceProfileId'])
    print(json.dumps({'account':identity['Account'],'region':session.region_name,'nova_lite_profiles':profiles,'remaining_credit':'Verify amount, expiry and eligible services in Billing; this script does not infer them from prior charges.'},indent=2))

if __name__=='__main__':main()
