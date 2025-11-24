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
        cookies = event.get('cookies', [])
        session_token = None
        
        for cookie in cookies:
            if cookie.startswith('session='):
                session_token = cookie.split('=', 1)[1]

                if ';' in session_token:
                    session_token = session_token.split(';')[0]
                break
        
        if not session_token:
            return error_response('Missing or invalid session', 401)
        
        try:
            response = sessions_table.get_item(Key={'sessionToken': session_token})
            if 'Item' not in response:
                return error_response('Invalid or expired session', 403)
            
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
            return error_response('Failed to fetch repositories from GitHub', endpoint_response.status_code)
        
        repos = endpoint_response.json()

        return {
            'statusCode': 200,
            'headers': {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get('FRONTEND_URL', '*'),
                "Access-Control-Allow-Credentials": "true" 
            },
            'body': json.dumps(repos)
        }

    except Exception as e:
        print(f"Error in oauth_callback: {str(e)}")
        return error_response('Internal server error', 500)

def error_response(message, status_code):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': os.environ.get('FRONTEND_URL', '*'),
            'Access-Control-Allow-Credentials': 'true'
        },
        'body': json.dumps({'error': message})
    }