import json
import os
import boto3
import requests
from cryptography.fernet import Fernet

dynamodb = boto3.resource('dynamodb')
sessions_table = dynamodb.Table(os.environ['SESSIONS_TABLE'])

cipher = Fernet(os.environ['ENCRYPTION_KEY'].encode())

def lambda_handler(event, context):
    try:
        headers = event.get('headers', {})
        authorization_header = headers.get('Authorization') or headers.get('authorization')

        session_token: str = None
        encrypted_db_token: str = None
        github_token: str = None

        if authorization_header and authorization_header.startswith('Bearer '):
            session_token = authorization_header.split(' ')[1]
        else:
            return error_response('Missing session token', 400)

        try:
            response = sessions_table.get_item(Key={'sessionToken': session_token})
            if 'Item' not in response:
                return error_response('Invalid session token', 403)
            
            encrypted_db_token = response['Item'].get('encryptedGithubToken')
    
        except Exception as e:
            return error_response('Failed to validate state', 500)
        
        try:
            encrypted_token = encrypted_db_token.encode()
            decrypted_token = cipher.decrypt(encrypted_token)
            github_token = decrypted_token.decode()

        except Exception as e:
            return error_response('Failed to decrypt session token', 500)
        
        get_repo_endpoint = "https://api.github.com/user/repos?per_page=100"
        endpoint_response = requests.get(
            get_repo_endpoint,
            headers={
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github+json",
            }
        )

        if endpoint_response.status_code != 200:
            print(authorization_header)
            print(session_token)
            return error_response('Failed to get repos from Github', endpoint_response.status_code)
        else:
            repos = endpoint_response.json()
            print(repos)

            return {
                'statusCode': 200,
                'headers': {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                'body': json.dumps(repos)
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