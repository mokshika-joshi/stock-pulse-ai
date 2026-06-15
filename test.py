from google import genai

client = genai.Client(api_key)
chat = client.chats.create(model="gemini-3-flash-preview")

for message in chat.get_history():
    print(f'role - {message.role}',end=": ")
    print(message.parts[0].text)
