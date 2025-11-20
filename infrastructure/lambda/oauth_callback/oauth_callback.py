import os
import uuid
import time
import boto3
import requests
from cryptography.fernet import Fernet

dynamodb = boto3.resource('dynamodb')
states_table = dynamodb.Table(os.environ['OAUTH_STATES_TABLE'])
sessions_table = dynamodb.Table(os.environ['SESSIONS_TABLE'])

cipher = Fernet(os.environ['ENCRYPTION_KEY'].encode())

def lambda_handler(event, context):
    try:
        query_params = event.get('queryStringParameters', {})
        code = query_params.get('code')
        state = query_params.get('state')
        
        if not code or not state:
            return error_response('Missing code or state parameter', 400)
        
        try:
            response = states_table.get_item(Key={'state': state})
            if 'Item' not in response:
                return error_response('Invalid state token', 403)
            
            states_table.delete_item(Key={'state': state})
            
        except Exception as e:
            print(f"Error validating state: {str(e)}")
            return error_response('Failed to validate state', 500)
        
        token_url = 'https://github.com/login/oauth/access_token'
        token_data = {
            'client_id': os.environ['GITHUB_CLIENT_ID'],
            'client_secret': os.environ['GITHUB_CLIENT_SECRET'],
            'code': code
        }
        
        token_response = requests.post(
            token_url,
            data=token_data,
            headers={'Accept': 'application/json'}
        )
        
        if token_response.status_code != 200:
            print(f"GitHub token exchange failed: {token_response.text}")
            return error_response('Failed to exchange code for token', 500)
        
        token_json = token_response.json()
        github_access_token = token_json.get('access_token')
        
        if not github_access_token:
            print(f"No access token in response: {token_json}")
            return error_response('No access token received from GitHub', 500)
        
        encrypted_token = cipher.encrypt(github_access_token.encode()).decode()
        
        session_token = str(uuid.uuid4())
        
        ttl = int(time.time()) + 3600  # 1 hour
        
        sessions_table.put_item(
            Item={
                'sessionToken': session_token,
                'encryptedGithubToken': encrypted_token,
                'ttl': ttl,
                'createdAt': int(time.time())
            }
        )
        
        frontend_url = os.environ['FRONTEND_URL']
        redirect_url = f"http://[::]:8000/?session={session_token}"
        
        return {
            'statusCode': 302,
            'headers': {
                'Location': redirect_url
            },
            'body': ''
        }
        
    except Exception as e:
        print(f"Error in oauth_callback: {str(e)}")
        return error_response('Internal server error', 500)

def error_response(message, status_code):
    """Helper function to return error responses"""
    frontend_url = os.environ.get('FRONTEND_URL', '/')
    error_url = f"{frontend_url}?error={message}"
    
    return {
        'statusCode': status_code,
        'headers': {
            'Location': error_url
        },
        'body': ''
    }