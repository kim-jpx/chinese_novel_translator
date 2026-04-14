from dotenv import load_dotenv
import os
load_dotenv()
key = os.getenv("ANTHROPIC_API_KEY")
print(key[:15], "...") if key else print("키 없음")
