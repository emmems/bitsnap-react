#!/bin/sh

# Generates TypeScript for the DRAFT contract in ./proto-draft (see
# proto-draft/README.md). Same plugins and options as proto.sh. Once the file
# lives in instapay/proto/public/v1 the line in proto.sh produces the same
# output and this script is deleted.
protoc --proto_path=./proto-draft --es_out ./src/gen/proto --es_opt target=ts --es_opt ts_nocheck=true --connect-query_out ./src/gen/proto --connect-query_opt target=ts --connect-query_opt ts_nocheck=true ./proto-draft/public/v1/user_panel_course.proto
