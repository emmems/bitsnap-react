# proto-draft

Contract-first drafts of API that does not exist on the server yet.

`public/v1/user_panel_course.proto` (`UserPanelCourseService`) is the API of the
course view of the panel (`bitsnap-react/course`). It is served by Bitsnap's
`/api/rpc`.

**This file must be moved to `instapay/proto/public/v1/` and `proto.sh` updated**
(ticket 05A does it): the `protoc` line of `proto.sh` that globs
`../instapay/proto/public/v1/*.proto` then generates the same files in
`src/gen/proto/public/v1/`, and `proto-course-draft.sh` and this folder are
deleted. Until then regenerate with `PATH="$PWD/node_modules/.bin:$PATH" ./proto-course-draft.sh`.
Do not edit the generated `user_panel_course_*.ts` by hand.
