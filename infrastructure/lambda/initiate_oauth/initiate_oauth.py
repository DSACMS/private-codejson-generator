import json
import os
import uuid
import time
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['OAUTH_STATES_TABLE'])

def lambda_handler(event, context):
    try:
        state = str(uuid.uuid4())

        ttl = int(time.time()) + 600 # 10 minutes

        table.put_item(
            Item={
                'state': state,
                'ttl': ttl,
                'createdAt': int(time.time())
            }
        )

        github_client_id = os.environ['GITHUB_CLIENT_ID']
        callback_url = os.environ['CALLBACK_URL']
        scope = 'repo'
        
        github_auth_url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={github_client_id}"
            f"&redirect_uri={callback_url}"
            f"&state={state}"
            f"&scope={scope}"
        )
        
        return {
            'statusCode': 302,
            'headers': {
                'Location': github_auth_url,
                'Access-Control-Allow-Origin': os.environ['FRONTEND_URL']
            },
            'body': ''
        }
        
    except Exception as e:
        print(f"Error in initiate_oauth: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': os.environ['FRONTEND_URL'],
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'error': 'Failed to initiate OAuth flow',
                'message': str(e)
            })
        }