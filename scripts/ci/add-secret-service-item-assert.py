import secretstorage

connection = secretstorage.dbus_init()
collection = secretstorage.get_default_collection(connection)

item_label = "label-123"
item_password = "password-123"
item_password_bytes = item_password.encode()
item = collection.create_item(item_label, {}, item_password_bytes)
resolved_item_password  = item.get_secret().decode("utf-8")

print("resolved_item_password:", resolved_item_password)

if resolved_item_password != item_password:
  raise Exception("Secrete Service initialization failed: setup and received passwords don't match.")

# TODO python secretstorage: according to docs you call "connection.close()" but there is such method
# connection.close()
