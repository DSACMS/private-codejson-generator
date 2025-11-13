import json
import os

def lambda_handler(event, context):
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': os.environ['FRONTEND_URL'],
            'Content-Type': 'application/json'
        },
        'body': json.dumps({
            'test': "hello"
        })
    }