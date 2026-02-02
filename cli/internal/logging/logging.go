package logging

import (
	"fmt"
	"time"
)

const TimeFormat = "2006-01-02 15:04:05"

func Printf(format string, args ...any) {
	fmt.Printf("%s "+format, append([]any{time.Now().Format(TimeFormat)}, args...)...)
}

func Println(args ...any) {
	fmt.Println(append([]any{time.Now().Format(TimeFormat)}, args...)...)
}
